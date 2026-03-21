import {
  Base,
  strings
} from "./chunk-GGEEJJAA.js";
import {
  require_prop_types
} from "./chunk-MIVMLEME.js";
import {
  require_react
} from "./chunk-HAKT4WWI.js";
import {
  __toESM
} from "./chunk-UE53HML6.js";

// node_modules/@douyinfe/semi-ui/lib/es/typography/text.js
var import_react = __toESM(require_react());
var import_prop_types = __toESM(require_prop_types());
var Text = class extends import_react.PureComponent {
  render() {
    return import_react.default.createElement(Base, Object.assign({
      component: "span"
    }, this.props));
  }
};
Text.propTypes = {
  copyable: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.bool]),
  delete: import_prop_types.default.bool,
  disabled: import_prop_types.default.bool,
  icon: import_prop_types.default.oneOfType([import_prop_types.default.node, import_prop_types.default.string]),
  ellipsis: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.bool]),
  mark: import_prop_types.default.bool,
  underline: import_prop_types.default.bool,
  link: import_prop_types.default.oneOfType([import_prop_types.default.object, import_prop_types.default.bool]),
  strong: import_prop_types.default.bool,
  type: import_prop_types.default.oneOf(strings.TYPE),
  size: import_prop_types.default.oneOf(strings.SIZE),
  style: import_prop_types.default.object,
  className: import_prop_types.default.string,
  code: import_prop_types.default.bool,
  component: import_prop_types.default.string,
  weight: import_prop_types.default.number
};
Text.defaultProps = {
  copyable: false,
  delete: false,
  disabled: false,
  icon: "",
  // editable: false,
  ellipsis: false,
  mark: false,
  underline: false,
  strong: false,
  link: false,
  type: "primary",
  style: {},
  size: "normal",
  className: ""
};

export {
  Text
};
//# sourceMappingURL=chunk-6BBHSHPJ.js.map
