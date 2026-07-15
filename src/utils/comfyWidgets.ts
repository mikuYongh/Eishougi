// src/utils/comfyWidgets.ts
//
// IT: Logica condivisa per distinguere, in base a object_info, quali input di un nodo ComfyUI
//     sono "widget" (disegnati dentro il nodo: seed, steps, menù...) e quali sono "socket"
//     (collegamenti tra nodi: MODEL, LATENT, CONDITIONING...). Usata sia dall'estrattore dei
//     parametri sia dalla registrazione dei nodi per il rendering del grafo.
// EN: Shared logic to tell, based on object_info, which inputs of a ComfyUI node are "widgets"
//     (drawn inside the node: seed, steps, dropdowns...) and which are "sockets" (links between
//     nodes: MODEL, LATENT, CONDITIONING...). Used by both the parameter extractor and the node
//     registration for graph rendering.

// IT: Tipi che ComfyUI disegna come widget. 'COMBO' è il formato recente dei menù a tendina;
//     nei file più vecchi un combo è invece un array annidato di opzioni.
// EN: Types that ComfyUI draws as widgets. 'COMBO' is the recent dropdown format; in older files
//     a combo is instead a nested array of options.
export const WIDGET_VALUE_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);

// IT: Valori del widget "control_after_generate" che ComfyUI aggiunge dopo un seed intero,
//     occupando una posizione in widgets_values.
// EN: Values of the "control_after_generate" widget ComfyUI adds after an integer seed,
//     occupying a slot in widgets_values.
export const SEED_CONTROL_VALUES = new Set(['fixed', 'increment', 'decrement', 'randomize']);

// IT: La definizione di un input in object_info: [tipo, config?]. Il tipo può essere una stringa
//     (es. 'INT', 'MODEL', 'COMBO') o un array di opzioni (combo "vecchio stile").
// EN: An input definition in object_info: [type, config?]. The type can be a string
//     (e.g. 'INT', 'MODEL', 'COMBO') or an array of options (old-style combo).
export type InputDefinition = [unknown, Record<string, unknown>?] | unknown;

// IT: Estrae il "tipo" da una definizione di input.
// EN: Extracts the "type" from an input definition.
export function getInputType(def: InputDefinition): unknown {
  return Array.isArray(def) ? def[0] : def;
}

// IT: Estrae la "config" (secondo elemento) da una definizione di input, se presente.
// EN: Extracts the "config" (second element) from an input definition, if present.
export function getInputConfig(def: InputDefinition): Record<string, unknown> | undefined {
  if (Array.isArray(def) && def.length > 1 && typeof def[1] === 'object' && def[1] !== null) {
    return def[1] as Record<string, unknown>;
  }
  return undefined;
}

// IT: True se l'input va disegnato come widget (e quindi occupa uno slot in widgets_values).
//     Un input con config.forceInput resta sempre un socket, anche se di tipo primitivo.
// EN: True if the input should be drawn as a widget (and thus occupies a widgets_values slot).
//     An input with config.forceInput is always a socket, even if of a primitive type.
export function isWidgetInput(def: InputDefinition): boolean {
  const config = getInputConfig(def);
  if (config?.forceInput === true) return false;
  const type = getInputType(def);
  return Array.isArray(type) || (typeof type === 'string' && WIDGET_VALUE_TYPES.has(type));
}

// IT: True se il nome dell'input è un seed (a cui ComfyUI affianca control_after_generate).
// EN: True if the input name is a seed (which ComfyUI pairs with control_after_generate).
export function isSeedInput(name: string): boolean {
  return /seed/i.test(name);
}
