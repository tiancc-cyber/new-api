import { ruby_default } from './chunk-BEQVXSFJ.js';
import './chunk-WZED4AWU.js';
import './chunk-WGBHRVG4.js';
import './chunk-TO7J22CO.js';
import './chunk-ZYG2KGG3.js';
import './chunk-OIBS6VKS.js';
import './chunk-R75LYVCW.js';
import './chunk-O5RPZYMG.js';
import './chunk-TSPZ43CV.js';
import './chunk-ST3CZ4LM.js';
import './chunk-4KWBWBLU.js';
import './chunk-2EKHLARE.js';
import './chunk-ZGT37PAW.js';
import './chunk-CQ35XRGX.js';
import './chunk-PNPQ6EMK.js';
import './chunk-BDGTCZVY.js';
import { html_default } from './chunk-BKLBPLLH.js';
import './chunk-GFXZGBI4.js';
import './chunk-BMBF3SKC.js';
import './chunk-UE53HML6.js';

// node_modules/@shikijs/langs/dist/erb.mjs
var lang = Object.freeze(
  JSON.parse(
    '{"displayName":"ERB","fileTypes":["erb","rhtml","html.erb"],"injections":{"text.html.erb - (meta.embedded.block.erb | meta.embedded.line.erb | comment)":{"patterns":[{"begin":"^(\\\\s*)(?=<%+#(?![^%]*%>))","beginCaptures":{"0":{"name":"punctuation.whitespace.comment.leading.erb"}},"end":"(?!\\\\G)(\\\\s*$\\\\n)?","endCaptures":{"0":{"name":"punctuation.whitespace.comment.trailing.erb"}},"patterns":[{"include":"#comment"}]},{"begin":"^(\\\\s*)(?=<%(?![^%]*%>))","beginCaptures":{"0":{"name":"punctuation.whitespace.embedded.leading.erb"}},"end":"(?!\\\\G)(\\\\s*$\\\\n)?","endCaptures":{"0":{"name":"punctuation.whitespace.embedded.trailing.erb"}},"patterns":[{"include":"#tags"}]},{"include":"#comment"},{"include":"#tags"}]}},"name":"erb","patterns":[{"include":"text.html.basic"}],"repository":{"comment":{"patterns":[{"begin":"<%+#","beginCaptures":{"0":{"name":"punctuation.definition.comment.begin.erb"}},"end":"%>","endCaptures":{"0":{"name":"punctuation.definition.comment.end.erb"}},"name":"comment.block.erb"}]},"tags":{"patterns":[{"begin":"<%+(?!>)[-=]?(?![^%]*%>)","beginCaptures":{"0":{"name":"punctuation.section.embedded.begin.erb"}},"contentName":"source.ruby","end":"(-?%)>","endCaptures":{"0":{"name":"punctuation.section.embedded.end.erb"},"1":{"name":"source.ruby"}},"name":"meta.embedded.block.erb","patterns":[{"captures":{"1":{"name":"punctuation.definition.comment.erb"}},"match":"(#).*?(?=-?%>)","name":"comment.line.number-sign.erb"},{"include":"source.ruby"}]},{"begin":"<%+(?!>)[-=]?","beginCaptures":{"0":{"name":"punctuation.section.embedded.begin.erb"}},"contentName":"source.ruby","end":"(-?%)>","endCaptures":{"0":{"name":"punctuation.section.embedded.end.erb"},"1":{"name":"source.ruby"}},"name":"meta.embedded.line.erb","patterns":[{"captures":{"1":{"name":"punctuation.definition.comment.erb"}},"match":"(#).*?(?=-?%>)","name":"comment.line.number-sign.erb"},{"include":"source.ruby"}]}]}},"scopeName":"text.html.erb","embeddedLangs":["html","ruby"]}',
  ),
);
var erb_default = [...html_default, ...ruby_default, lang];
export { erb_default as default };
//# sourceMappingURL=erb-QPVXPXM4.js.map
