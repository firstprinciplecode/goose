import React from 'react';
import { Parameter } from '../../recipe';
import { AlertTriangle, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

interface ParameterInputProps {
  parameter: Parameter;
  onChange: (name: string, updatedParameter: Partial<Parameter>) => void;
  isUnused?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: (parameterKey: string) => void;
  onDelete?: (parameterKey: string) => void;
}

const ParameterInput: React.FC<ParameterInputProps> = ({
  parameter,
  onChange,
  isUnused = false,
  isExpanded = true,
  onToggleExpanded,
  onDelete,
}) => {
  // All values are derived directly from props, maintaining the controlled component pattern
  const { key, description, requirement } = parameter;
  const defaultValue = parameter.default || '';

  return (
    <div className="parameter-input my-4 p-4 border rounded-lg bg-bgSubtle shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <button
          type="button"
          className="flex items-center gap-2 text-lg font-bold text-textProminent"
          onClick={() => onToggleExpanded?.(parameter.key)}
        >
          {onToggleExpanded ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 opacity-70" />
            ) : (
              <ChevronRight className="h-4 w-4 opacity-70" />
            )
          ) : null}
          <span>
            Parameter:{' '}
            <code className="bg-background-default px-2 py-1 rounded-md">{parameter.key}</code>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {isUnused && (
            <span className="inline-flex items-center gap-1 text-orange-500 text-xs font-medium">
              <AlertTriangle className="h-3 w-3" />
              Unused
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              title="Delete parameter"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-background-muted transition-colors"
              onClick={() => onDelete(parameter.key)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!isExpanded && (
        <p className="text-sm text-textSubtle">
          {description || 'No description'}
        </p>
      )}

      {isExpanded && (
        <>

      <div className="mb-4">
        <label className="block text-md text-textStandard mb-2 font-semibold">description</label>
        <input
          type="text"
          value={description || ''}
          onChange={(e) => onChange(key, { description: e.target.value })}
          className="w-full p-3 border rounded-lg bg-background-default text-textStandard focus:outline-none focus:ring-2 focus:ring-borderProminent"
          placeholder={`E.g., "Enter the name for the new component"`}
        />
        <p className="text-sm text-textSubtle mt-1">This is the message the end-user will see.</p>
      </div>

      {/* Controls for requirement, input type, and default value */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-md text-textStandard mb-2 font-semibold">Input Type</label>
          <select
            className="w-full p-3 border rounded-lg bg-background-default text-textStandard"
            value={parameter.input_type || 'string'}
            onChange={(e) =>
              onChange(key, { input_type: e.target.value as Parameter['input_type'] })
            }
          >
            <option value="string">String</option>
            <option value="select">Select</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>

        <div>
          <label className="block text-md text-textStandard mb-2 font-semibold">Requirement</label>
          <select
            className="w-full p-3 border rounded-lg bg-background-default text-textStandard"
            value={requirement}
            onChange={(e) =>
              onChange(key, { requirement: e.target.value as Parameter['requirement'] })
            }
          >
            <option value="required">Required</option>
            <option value="optional">Optional</option>
          </select>
        </div>

        {/* The default value input is only shown for optional parameters */}
        {requirement === 'optional' && (
          <div>
            <label className="block text-md text-textStandard mb-2 font-semibold">
              Default Value
            </label>
            <input
              type="text"
              value={defaultValue}
              onChange={(e) => onChange(key, { default: e.target.value })}
              className="w-full p-3 border rounded-lg bg-background-default text-textStandard"
              placeholder="Enter default value"
            />
          </div>
        )}
      </div>

      {/* Options field for select input type */}
      {parameter.input_type === 'select' && (
        <div className="mt-4">
          <label className="block text-md text-textStandard mb-2 font-semibold">
            Options (one per line)
          </label>
          <textarea
            value={(parameter.options || []).join('\n')}
            onChange={(e) => {
              // Don't filter out empty lines - preserve them so user can type on new lines
              const options = e.target.value.split('\n');
              onChange(key, { options });
            }}
            onKeyDown={(e) => {
              // Allow Enter key to work normally in textarea (prevent form submission or modal close)
              if (e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
            className="w-full p-3 border rounded-lg bg-background-default text-textStandard focus:outline-none focus:ring-2 focus:ring-borderProminent"
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={4}
          />
          <p className="text-sm text-textSubtle mt-1">
            Enter each option on a new line. These will be shown as dropdown choices.
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default ParameterInput;
