// An in-memory stand-in for the DynamoDB document client, for offline tests. It understands the handful of commands
// and key conditions the backend uses (Put/Get/Delete/Query by pk, sk prefix, or gsi1pk), per table.
// Tests wire it in with: vi.mock('@aws-sdk/lib-dynamodb', async (orig) => ({ ...(await orig()), DynamoDBDocumentClient: { from: () => memdb } })).
type Item = Record<string, unknown>;
interface Command {
  constructor: { name: string };
  input: Item;
}

export function makeMemDb() {
  const tables = new Map<string, Map<string, Item>>();
  const table = (name: unknown) => {
    const key = String(name);
    if (!tables.has(key)) tables.set(key, new Map());
    return tables.get(key) as Map<string, Item>;
  };
  const idOf = (k: Item) => `${String(k.pk)}\u0000${String(k.sk)}`;
  return {
    items: (name: string): Item[] => [...table(name).values()],
    async send(cmd: Command): Promise<Item> {
      const i = cmd.input;
      const t = table(i.TableName);
      switch (cmd.constructor.name) {
        case 'PutCommand':
          t.set(idOf(i.Item as Item), structuredClone(i.Item as Item));
          return {};
        case 'GetCommand':
          return { Item: t.get(idOf(i.Key as Item)) };
        case 'DeleteCommand': {
          const old = t.get(idOf(i.Key as Item));
          t.delete(idOf(i.Key as Item));
          return i.ReturnValues === 'ALL_OLD' ? { Attributes: old } : {};
        }
        case 'QueryCommand': {
          const v = (i.ExpressionAttributeValues ?? {}) as Record<string, string | undefined>;
          const all = [...t.values()];
          if (i.IndexName) return { Items: all.filter((x) => x.gsi1pk === v[':p']) };
          // corpus.ts uses (:p = pk, :s = sk prefix); db.ts uses (:pk, :p = sk prefix); GET /plans uses :p alone.
          const pk = v[':pk'] ?? v[':p'];
          const prefix = v[':s'] ?? (v[':pk'] ? v[':p'] : undefined);
          return { Items: all.filter((x) => x.pk === pk && (prefix === undefined || String(x.sk).startsWith(prefix))).sort((a, b) => (String(a.sk) < String(b.sk) ? -1 : 1)) };
        }
        default:
          throw new Error(`memdb: unsupported ${cmd.constructor.name}`);
      }
    },
  };
}
