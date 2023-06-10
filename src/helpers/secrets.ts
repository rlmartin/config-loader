import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export async function loadSecretJson(secretName: string, region: string): Promise<object> {
  const secretsManager = new SecretsManagerClient({
    region,
  });
  const secret = await secretsManager.send(new GetSecretValueCommand({
    SecretId: secretName,
  }));
  const secretJson = secret.SecretString ? JSON.parse(secret.SecretString) : {};
  return secretJson;
}
