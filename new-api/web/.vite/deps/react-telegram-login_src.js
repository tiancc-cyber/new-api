import {
  require_react
} from "./chunk-LNK32FLG.js";
import {
  require_prop_types
} from "./chunk-MIVMLEME.js";
import "./chunk-PNM3REHP.js";
import {
  __toESM
} from "./chunk-UE53HML6.js";

// node_modules/react-telegram-login/src/index.js
var import_react = __toESM(require_react());
var import_prop_types = __toESM(require_prop_types());
var TelegramLoginButton = class extends import_react.default.Component {
  constructor(props) {
    super(props);
  }
  componentDidMount() {
    const {
      botName,
      buttonSize,
      cornerRadius,
      requestAccess,
      usePic,
      dataOnauth,
      dataAuthUrl,
      lang
    } = this.props;
    window.TelegramLoginWidget = {
      dataOnauth: (user) => dataOnauth(user)
    };
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?9";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", buttonSize);
    if (cornerRadius !== void 0) {
      script.setAttribute("data-radius", cornerRadius);
    }
    script.setAttribute("data-request-access", requestAccess);
    script.setAttribute("data-userpic", usePic);
    script.setAttribute("data-lang", lang);
    if (dataAuthUrl !== void 0) {
      script.setAttribute("data-auth-url", dataAuthUrl);
    } else {
      script.setAttribute(
        "data-onauth",
        "TelegramLoginWidget.dataOnauth(user)"
      );
    }
    script.async = true;
    this.instance.appendChild(script);
  }
  render() {
    return import_react.default.createElement(
      "div",
      {
        className: this.props.className,
        ref: (component) => {
          this.instance = component;
        }
      },
      this.props.children
    );
  }
};
TelegramLoginButton.propTypes = {
  botName: import_prop_types.default.string.isRequired,
  dataOnauth: import_prop_types.default.func,
  buttonSize: import_prop_types.default.oneOf(["large", "medium", "small"]),
  cornerRadius: import_prop_types.default.number,
  requestAccess: import_prop_types.default.string,
  usePic: import_prop_types.default.bool,
  lang: import_prop_types.default.string
};
TelegramLoginButton.defaultProps = {
  botName: "samplebot",
  dataOnauth: () => void 0,
  buttonSize: "large",
  requestAccess: "write",
  usePic: true,
  lang: "en"
};
var src_default = TelegramLoginButton;
export {
  src_default as default
};
//# sourceMappingURL=react-telegram-login_src.js.map
