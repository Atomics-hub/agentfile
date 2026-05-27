export interface VscodeSettingsOptions {
  schemaPath?: string;
  yamlMatches?: string[];
  jsonMatches?: string[];
}

export const defaultVscodeSchemaPath = ".vscode/agentfile.schema.json";
export const defaultVscodeSettingsPath = ".vscode/settings.json";

export const defaultVscodeYamlMatches = [
  "agentfile.yaml",
  "agentfile.yml",
  ".agent/agentfile.yaml",
  ".agent/agentfile.yml"
];

export const defaultVscodeJsonMatches = [
  "agentfile.json",
  ".agent/agentfile.json"
];

export function renderVscodeSettings(options: VscodeSettingsOptions = {}): string {
  const schemaPath = options.schemaPath ?? defaultVscodeSchemaPath;
  const yamlMatches = options.yamlMatches ?? defaultVscodeYamlMatches;
  const jsonMatches = options.jsonMatches ?? defaultVscodeJsonMatches;

  return `${JSON.stringify({
    "yaml.schemas": {
      [schemaPath]: yamlMatches
    },
    "json.schemas": [
      {
        fileMatch: jsonMatches,
        url: schemaPath
      }
    ]
  }, null, 2)}\n`;
}
