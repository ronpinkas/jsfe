/**
 * enum_from: a flow parameter whose allowed values come from the session when the flow is selected, not from the
 * flow file. Two-stage intent detection resolves it right before stage 2, so only the selected flow's request
 * changes: its enum becomes the source's keys, each value carrying its label for both executors.
 *
 * Sources are jsfe's own, by name (a flow never names a host function here): each takes the session cargo and
 * returns [{key, label}].
 */
import {sendables} from './sendables.js';

export const ENUM_SOURCES = Object.freeze({
   sendables: (cargo) => sendables(cargo),
});

const isText = (value) => typeof value === 'string' && value.trim() !== '';

/** The source's options as [{key, label}]: first of each key (ignoring case), malformed items left out. */
export function enumSourceOptions(source, cargo) {
   const read = ENUM_SOURCES[source];
   if (!read) {
      throw new Error(`enum_from: unknown source "${source}"`);
   } else {
      const seen = new Set();
      const options = [];
      for (const item of read(cargo || {}) || []) {
         const key = isText(item?.key) ? item.key.trim() : '';
         if (!key || seen.has(key.toLowerCase())) {
            continue; // unusable or repeated key
         } else {
            seen.add(key.toLowerCase());
            options.push({key, label: isText(item.label) ? item.label.trim() : key});
         }
      }
      return options;
   }
}

/**
 * The flow as stage 2 sees it this turn: each enum_from parameter takes its source's keys as its enum and their
 * labels as enumLabels. A source with nothing to offer makes the parameter internal for this turn (nothing to
 * pick, so the flow asks). A flow without enum_from is returned as is.
 */
export function resolveEnumSources(flow, cargo) {
   const parameters = Array.isArray(flow?.parameters) ? flow.parameters : [];
   if (!parameters.some((p) => p && p.enum_from !== undefined)) {
      return flow;
   } else {
      return {
         ...flow,
         parameters: parameters.map((p) => {
            if (!p || p.enum_from === undefined) {
               return p;
            } else {
               const {enum_from: source, ...rest} = p;
               const options = enumSourceOptions(source, cargo);
               return options.length
                  ? {...rest, enum: options.map((o) => o.key), enumLabels: Object.fromEntries(options.map((o) => [o.key, o.label]))}
                  : {...rest, internal: true};
            }
         }),
      };
   }
}
