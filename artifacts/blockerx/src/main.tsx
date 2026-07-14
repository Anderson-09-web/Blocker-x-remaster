import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

document.documentElement.classList.add("dark");

// ─── Radix UI portal-cleanup fix ───────────────────────────────────────────
// When a Radix Select/DropdownMenu closes, React 18's concurrent renderer
// sometimes calls removeChild / insertBefore on a node that has already been
// removed from the DOM (race between the virtual DOM and the live DOM).
//
// These DOMExceptions propagate through flushSync → React reconciler →
// PageErrorBoundary. Even when the boundary returns hasError:false, React
// still unmounts + remounts all children, wiping every useState value and
// closing any open dropdown — making the menu appear "broken".
//
// Patching the two DOM methods at the source is the only reliable fix:
// the error is swallowed before React ever sees it, so no boundary is
// triggered and no remount happens.
const _removeChild = Node.prototype.removeChild;
// @ts-ignore — intentional monkey-patch
Node.prototype.removeChild = function (child) {
  try { return _removeChild.call(this, child); }
  catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return child;
    throw e;
  }
};

const _insertBefore = Node.prototype.insertBefore;
// @ts-ignore
Node.prototype.insertBefore = function (node, ref) {
  try { return _insertBefore.call(this, node, ref); }
  catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return node;
    throw e;
  }
};

const apiUrl = import.meta.env.VITE_API_URL;
if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
