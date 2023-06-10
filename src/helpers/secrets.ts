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
      return recursivelyLoadObject(json, region);
    }
  } else {
    return json;
  }
}

export async function recursivelyLoadObject(obj: object, region: string): Promise<object> {
  const loadedEntries = await Promise.all(Object.entries(obj).map(async ([key, value]) => {
    var json = value;
    try {
      if (json && typeof json === 'string') json = JSON.parse(json);
    } catch {}
    return [key, await recursivelyLoad(json, region)];
  }));
  return loadedEntries.reduce((current, [key, value]) => {
    current[key] = value;
    return current;
  }, Object.assign({}));
}