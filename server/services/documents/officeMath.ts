import {
  DOMParser,
  XMLSerializer,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import { PreparationDocumentError } from "./errors";

const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS = "http://www.w3.org/2000/xmlns/";
export const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
const children = (element: XmlNode): XmlElement[] =>
  Array.from(element.childNodes).filter(
    (node) => node.nodeType === 1,
  ) as XmlElement[];
const child = (element: XmlNode, local: string) =>
  children(element).find((node) => node.localName === local);

/** OMML stays editable in Word; reject executable/foreign OOXML and entity declarations. */
export function validateOmml(xml: string): string {
  if (!xml || xml.length > 100_000 || /<!DOCTYPE|<!ENTITY|<\?/i.test(xml))
    throw new PreparationDocumentError(
      "FORMULA_INVALID",
      "公式结构不受支持，教案已保留。请检查或重新输入公式。",
    );
  let invalid = false;
  const document = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(xml, "application/xml");
  const root = document.documentElement;
  let count = 0;
  const wordTags = new Set([
    "r",
    "t",
    "rPr",
    "rFonts",
    "b",
    "i",
    "bCs",
    "iCs",
    "color",
    "sz",
    "szCs",
    "lang",
    "vertAlign",
    "noProof",
  ]);
  const visit = (node: XmlElement, depth = 0) => {
    if (
      ++count > 3000 ||
      depth > 40 ||
      (node.namespaceURI !== M &&
        !(node.namespaceURI === W && wordTags.has(node.localName)))
    )
      invalid = true;
    for (const attribute of Array.from(node.attributes))
      if (
        attribute.namespaceURI &&
        ![M, W, XMLNS, "http://www.w3.org/XML/1998/namespace"].includes(
          attribute.namespaceURI,
        )
      )
        invalid = true;
    children(node).forEach((n) => visit(n, depth + 1));
  };
  if (
    !root ||
    root.namespaceURI !== M ||
    !["oMath", "oMathPara"].includes(root.localName)
  )
    invalid = true;
  else visit(root);
  if (invalid)
    throw new PreparationDocumentError(
      "FORMULA_INVALID",
      "公式结构无法安全导出，原稿未修改。请核对该公式。",
    );
  root.setAttributeNS(XMLNS, "xmlns:m", M);
  root.setAttributeNS(XMLNS, "xmlns:w", W);
  return new XMLSerializer().serializeToString(root);
}

export function ommlToLatex(xml: string): string {
  const root = new DOMParser().parseFromString(
    validateOmml(xml),
    "application/xml",
  ).documentElement;
  const render = (node: XmlElement): string => {
    const inner = (name: string) => {
      const found = child(node, name);
      return found ? render(found) : "";
    };
    if (node.localName === "t") return node.textContent ?? "";
    if (node.localName.endsWith("Pr")) return "";
    if (node.localName === "f")
      return `\\frac{${inner("num")}}{${inner("den")}}`;
    if (node.localName === "sSup") return `{${inner("e")}}^{${inner("sup")}}`;
    if (node.localName === "sSub") return `{${inner("e")}}_{${inner("sub")}}`;
    if (node.localName === "sSubSup")
      return `{${inner("e")}}_{${inner("sub")}}^{${inner("sup")}}`;
    if (node.localName === "rad")
      return inner("deg")
        ? `\\sqrt[${inner("deg")}]{${inner("e")}}`
        : `\\sqrt{${inner("e")}}`;
    if (node.localName === "d") {
      const properties = child(node, "dPr");
      const begin =
        properties && child(properties, "begChr")?.getAttribute("m:val");
      const end =
        properties && child(properties, "endChr")?.getAttribute("m:val");
      return `${begin ?? "("}${inner("e")}${end ?? ")"}`;
    }
    return children(node).map(render).join("");
  };
  return render(root).slice(0, 10_000);
}

const symbols: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  pi: "π",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  theta: "θ",
  Delta: "Δ",
  delta: "δ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
  omega: "ω",
  Omega: "Ω",
  infty: "∞",
  angle: "∠",
  degree: "°",
  circ: "∘",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftrightarrow: "⇔",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  log: "log",
  ln: "ln",
  lim: "lim",
};
const run = (text: string) =>
  `<m:r><m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`;

/** A bounded parser for school-level TeX. Unsupported commands fail explicitly, never disappear. */
export function latexToOmml(latex: string, display = false): string {
  if (latex.length > 10_000)
    throw new PreparationDocumentError(
      "FORMULA_TOO_LONG",
      "公式过长，尚未导出。请拆分公式。",
    );
  let index = 0,
    depth = 0;
  const unsupported = () => {
    throw new PreparationDocumentError(
      "FORMULA_UNSUPPORTED",
      "此公式包含暂不支持的写法，尚未导出文件，原稿已保留。请改用分数、上下标、根式或普通符号，或保留为图片。",
    );
  };
  const group = (): string => {
    while (latex[index] === " ") index++;
    if (latex[index] === "{") {
      index++;
      return sequence("}");
    }
    return atom();
  };
  const atom = (): string => {
    if (index >= latex.length) return "";
    if (latex[index] === "{") return group();
    if (latex[index] === "\\") {
      index++;
      const match = /^[A-Za-z]+/.exec(latex.slice(index));
      const command = match?.[0] ?? latex[index++] ?? "";
      if (match) index += command.length;
      if (["frac", "dfrac", "tfrac"].includes(command))
        return `<m:f><m:num>${group()}</m:num><m:den>${group()}</m:den></m:f>`;
      if (command === "sqrt") {
        let degree = "";
        if (latex[index] === "[") {
          index++;
          degree = sequence("]");
        }
        return `<m:rad><m:radPr>${degree ? "" : '<m:degHide m:val="1"/>'}</m:radPr><m:deg>${degree}</m:deg><m:e>${group()}</m:e></m:rad>`;
      }
      if (["left", "right"].includes(command)) return "";
      if (
        ["text", "mathrm", "mathbf", "mathit", "operatorname"].includes(command)
      )
        return group();
      if (["quad", "qquad", ",", ";", " ", "!"].includes(command))
        return run(" ");
      if (["{", "}", "_", "%", "#", "&", "$"].includes(command))
        return run(command);
      if (symbols[command]) return run(symbols[command]);
      return unsupported();
    }
    const character = latex[index++];
    if (["}", "]", "^", "_"].includes(character)) return unsupported();
    return run(character);
  };
  const sequence = (end?: string): string => {
    if (++depth > 30) return unsupported();
    let result = "";
    while (index < latex.length && latex[index] !== end) {
      let value = atom(),
        sub = "",
        sup = "";
      while (latex[index] === "^" || latex[index] === "_") {
        const script = latex[index++];
        const content = group();
        if (script === "^") sup = content;
        else sub = content;
      }
      if (sub && sup)
        value = `<m:sSubSup><m:e>${value}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
      else if (sup)
        value = `<m:sSup><m:e>${value}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
      else if (sub)
        value = `<m:sSub><m:e>${value}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
      result += value;
    }
    if (end) {
      if (latex[index] !== end) return unsupported();
      index++;
    }
    depth--;
    return result;
  };
  const formula = `<m:oMath xmlns:m="${M}" xmlns:w="${W}">${sequence()}</m:oMath>`;
  return validateOmml(
    display
      ? `<m:oMathPara xmlns:m="${M}" xmlns:w="${W}">${formula}</m:oMathPara>`
      : formula,
  );
}
