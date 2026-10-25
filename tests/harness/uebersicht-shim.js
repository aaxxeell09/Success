// Substitut minimal du module « uebersicht » pour le harnais.
import React from 'react';

let counter = 0;
export const css = (strings, ...values) => {
  const body = Array.isArray(strings)
    ? strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '')
    : String(strings);
  const name = `ub-css-${++counter}`;
  const style = document.createElement('style');
  style.textContent = `.${name} { ${body} }`;
  document.head.appendChild(style);
  return name;
};
export const styled = new Proxy({}, {
  get: (_, tag) => (strings, ...values) => {
    const cls = css(strings, ...values);
    return (props) => React.createElement(tag, { ...props, className: [cls, props.className].filter(Boolean).join(' ') });
  },
});
export const run = () => Promise.resolve('');
export { React };
