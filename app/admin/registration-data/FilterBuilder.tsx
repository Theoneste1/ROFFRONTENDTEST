"use client";

/**
 * The filter builder: conditions on any field the category offers, joined by "all" (AND) or "any" (OR), and groups of
 * conditions inside (up to four levels). The fields, their conditions and their choices all come from the backend.
 */
import { Plus, Trash2 } from "lucide-react";
import {
  addCondition, addGroup, groupFields, initialValue, isGroup, MAX_DEPTH, newCondition, removeAt, setCombinator, setCondition,
  type FilterCondition, type FilterGroup, type OperatorInfo, type Path, type RegistrationField,
} from "@/lib/admin/registration-data";

const control = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function FilterBuilder({ value, onChange, fields, operators }: {
  value: FilterGroup; onChange: (g: FilterGroup) => void; fields: RegistrationField[]; operators: Record<string, OperatorInfo>;
}) {
  return <GroupEditor root={value} group={value} path={[]} onChange={onChange} fields={fields} operators={operators} />;
}

function GroupEditor({ root, group, path, onChange, fields, operators, onRemove }: {
  root: FilterGroup; group: FilterGroup; path: Path; onChange: (g: FilterGroup) => void; fields: RegistrationField[];
  operators: Record<string, OperatorInfo>; onRemove?: () => void;
}) {
  const filterable = fields.filter((f) => f.filterable);
  const depth = path.length + 1;
  return (
    <div className={`space-y-2 rounded-xl border ${depth > 1 ? "border-dashed border-indigo-200 bg-indigo-50/40" : "border-gray-200 bg-white"} p-3`} data-testid={`filter-group-${path.join("-") || "root"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
        <span>Match</span>
        <select
          className={control}
          value={group.combinator}
          onChange={(e) => onChange(setCombinator(root, path, e.target.value as "AND" | "OR"))}
          aria-label="Match all or any of these conditions"
          data-testid={`combinator-${path.join("-") || "root"}`}
        >
          <option value="AND">all of these (AND)</option>
          <option value="OR">any of these (OR)</option>
        </select>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove group
          </button>
        )}
      </div>
      {group.conditions.length === 0 && <p className="text-xs text-gray-500">No conditions yet.</p>}
      {group.conditions.map((c, i) =>
        isGroup(c) ? (
          <GroupEditor key={i} root={root} group={c} path={[...path, i]} onChange={onChange} fields={fields} operators={operators} onRemove={() => onChange(removeAt(root, path, i))} />
        ) : (
          <ConditionRow
            key={i}
            condition={c}
            fields={filterable}
            operators={operators}
            testId={`condition-${[...path, i].join("-")}`}
            onChange={(next) => onChange(setCondition(root, path, i, next))}
            onRemove={() => onChange(removeAt(root, path, i))}
          />
        ),
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          onClick={() => filterable[0] && onChange(addCondition(root, path, newCondition(filterable[0])))}
          data-testid={`add-condition-${path.join("-") || "root"}`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add condition
        </button>
        {depth < MAX_DEPTH && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            onClick={() => onChange(addGroup(root, path, group.combinator === "AND" ? "OR" : "AND"))}
            data-testid={`add-group-${path.join("-") || "root"}`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add group
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({ condition, fields, operators, onChange, onRemove, testId }: {
  condition: FilterCondition; fields: RegistrationField[]; operators: Record<string, OperatorInfo>;
  onChange: (c: FilterCondition) => void; onRemove: () => void; testId: string;
}) {
  const field = fields.find((f) => f.key === condition.field);
  const op = operators[condition.operator];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <select
        className={`${control} max-w-[16rem]`}
        value={condition.field}
        aria-label="Field"
        data-testid={`${testId}-field`}
        onChange={(e) => {
          const f = fields.find((x) => x.key === e.target.value);
          if (f) onChange(newCondition(f));
        }}
      >
        {!field && <option value={condition.field}>(no longer available)</option>}
        {groupFields(fields).map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.fields.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {field && (
        <select
          className={control}
          value={condition.operator}
          aria-label="Condition"
          data-testid={`${testId}-operator`}
          onChange={(e) => onChange({ field: field.key, operator: e.target.value, value: keepValue(field, condition, e.target.value), value2: undefined })}
        >
          {field.operators.map((o) => (
            <option key={o} value={o}>{operators[o]?.label ?? o}</option>
          ))}
        </select>
      )}
      {field && op?.needsValue && (
        <ValueInput field={field} value={condition.value} onChange={(v) => onChange({ ...condition, value: v })} testId={`${testId}-value`} label={`${field.label}: value`} />
      )}
      {field && op?.range && (
        <>
          <span className="text-xs text-gray-500">and</span>
          <ValueInput field={field} value={condition.value2} onChange={(v) => onChange({ ...condition, value2: v })} testId={`${testId}-value2`} label={`${field.label}: second value`} />
        </>
      )}
      <button type="button" onClick={onRemove} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600" aria-label="Remove condition" data-testid={`${testId}-remove`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The value stays when the new condition takes the same kind of value (a list stays a list). */
function keepValue(field: RegistrationField, c: FilterCondition, operator: string): unknown {
  const fresh = initialValue(field, operator);
  if (fresh === undefined) return undefined;
  return Array.isArray(fresh) === Array.isArray(c.value) && c.value !== undefined ? c.value : fresh;
}

function ValueInput({ field, value, onChange, testId, label }: { field: RegistrationField; value: unknown; onChange: (v: unknown) => void; testId: string; label: string }) {
  if (field.values && (field.type === "enum" || field.type === "enumList")) {
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label} data-testid={testId}>
        {field.values.map((v) => {
          const on = chosen.includes(v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? chosen.filter((x) => x !== v) : [...chosen, v])}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {field.valueLabels?.[v] ?? v}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === "textList") {
    const text = Array.isArray(value) ? (value as string[]).join(", ") : "";
    return (
      <input className={control} aria-label={label} data-testid={testId} placeholder="values, separated by commas" defaultValue={text}
        onBlur={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
    );
  }
  const type = field.type === "number" ? "number" : field.type === "date" || field.type === "datetime" ? "date" : "text";
  return (
    <input
      className={`${control} ${type === "text" ? "min-w-[10rem]" : ""}`}
      type={type}
      step={field.integer ? 1 : "any"}
      aria-label={label}
      data-testid={testId}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      maxLength={type === "text" ? 200 : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
