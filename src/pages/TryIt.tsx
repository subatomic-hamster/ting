import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/** For the title slide: judges scan this and land in the hosted app as the seeded demo member, demo panel open. */
export default function TryIt() {
  const url = `${window.location.origin}/?persona=dale&demo=1`;
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
          Explore sample treatment costs and change dates to compare estimates.
        </p>
        <div
          className="mx-auto mt-4 w-64"
          aria-label={`QR code for ${url}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="mt-3 font-mono text-xs break-all text-muted">{url}</p>
        <p className="mt-4 text-xs text-muted">
          This opens the sample account with illustrative fees.
        </p>
        <Link to="/?persona=dale&demo=1" className="btn-primary mt-5 w-full">
          Open the sample app
        </Link>
      </div>
    </div>
  );
}
