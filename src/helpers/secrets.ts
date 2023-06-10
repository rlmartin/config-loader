import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export const Ref = '$ref';

export async function loadSecretJson(secretName: string, region: string): Promise<any> {
  const secretsManager = new SecretsManagerClient({
    region,
  });
  const secret = await secretsManager.send(new GetSecretValueCommand({
    SecretId: secretName,
  }));
  var secretJson = secret.SecretString;
  try {
    if (secretJson) secretJson = JSON.parse(secretJson);
  } catch {}
  return secretJson ? recursivelyLoad(secretJson, region) : undefined;
}

export async function recursivelyLoad(json: any, region: string): Promise<any> {
  if (Array.isArray(json)) {
    return Promise.all(json.map(item => recursivelyLoad(item, region)));
  } else if (json !== null && typeof json === 'object') {
    if (json[Ref]) {
      // Note: $ref is case-sensitive and is assumed to be the only property;
      // all other properties will be dropped.
      return loadSecretJson(json[Ref], region);
    } else {
      const loadedEntries = await Promise.all(Object.entries(json).map(async ([key, value]) => [key, await recursivelyLoad(value, region)]));
      return loadedEntries.reduce((current, [key, value]) => {
        current[key] = value;
        return current;
      }, Object.assign({}));
    }
  } else {
    return json;
  }
}
