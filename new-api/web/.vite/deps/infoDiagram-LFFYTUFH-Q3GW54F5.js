import {
  parse
} from "./chunk-G7XXIRXJ.js";
import "./chunk-NNNETVK7.js";
import "./chunk-4YYWP455.js";
import "./chunk-MBVPKFPQ.js";
import "./chunk-KQJUE6OI.js";
import "./chunk-RR5IXM4L.js";
import "./chunk-2XR5FZ4C.js";
import "./chunk-2RDW5VCQ.js";
import "./chunk-5SMYMPSU.js";
import {
  selectSvgElement
} from "./chunk-LGR27ENT.js";
import {
  configureSvgSize
} from "./chunk-LQLXUK6X.js";
import {
  __name,
  log
} from "./chunk-OQUVF2X3.js";
import "./chunk-ZXFBJHF7.js";
import "./chunk-J6ANVC7P.js";
import "./chunk-YFRUBO2K.js";
import "./chunk-SW2NX7BB.js";
import "./chunk-UE53HML6.js";

// node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-LFFYTUFH.mjs
var parser = {
  parse: __name(async (input) => {
    const ast = await parse("info", input);
    log.debug(ast);
  }, "parse")
};
var DEFAULT_INFO_DB = {
  version: "11.13.0" + (true ? "" : "-tiny")
};
var getVersion = __name(() => DEFAULT_INFO_DB.version, "getVersion");
var db = {
  getVersion
};
var draw = __name((text, id, version) => {
  log.debug("rendering info diagram\n" + text);
  const svg = selectSvgElement(id);
  configureSvgSize(svg, 100, 400, true);
  const group = svg.append("g");
  group.append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${version}`);
}, "draw");
var renderer = { draw };
var diagram = {
  parser,
  db,
  renderer
};
export {
  diagram
};
//# sourceMappingURL=infoDiagram-LFFYTUFH-Q3GW54F5.js.map
