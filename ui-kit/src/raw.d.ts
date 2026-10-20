// The tests read the source of a component as text (`?raw`, a feature of Vite).
declare module '*.svelte?raw' {
  const source: string;
  export default source;
}
