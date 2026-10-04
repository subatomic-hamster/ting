import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/** For the title slide: visitors scan this, create their own account and get their own dental year. */
export default function TryIt() {
  const url = `${window.location.origin}/signup`;
  const [svg, setSvg] = useState("");
  useEffect(() => {
    void QRCode.toString(url, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
    }).then(setSvg);
  }, [url]);

  return (
    <div className="grid min-h-screen place-items-center bg-paper p-6">
      <div className="card w-full max-w-md text-center">
        <h1>Try Ting on your phone</h1>
        <p className="mt-1 text-sm text-muted">
          Create an account, answer six questions, and see what your dental year will cost.
        </p>
        <div
          className="mx-auto mt-4 w-64"
          aria-label={`QR code for ${url}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-3 font-mono text-xs break-all text-muted">{url}</p>
        <Link to="/signup" className="btn-primary mt-5 w-full">
          Create an account
        </Link>
        <Link to="/?persona=dale&demo=1" className="btn-ghost mt-2 w-full">
          Explore the sample member with demo controls
        </Link>
      </div>
    </div>
  );
}
