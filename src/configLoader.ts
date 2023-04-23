import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { parse } from '@aws-sdk/util-arn-parser';
import { Context } from 'aws-lambda';

export class ConfigLoader<C> {
  context: Context;
  config?: C;

  constructor(context: Context) {
    this.context = context;
  }

  private async loadConfig(context: Context): Promise<C> {
    const secretsManager = new SecretsManagerClient({
      region: process.env.AWS_REGION ?? parse(context.invokedFunctionArn).region,
    });
    const secret = await secretsManager.send(new GetSecretValueCommand({
      SecretId: context.functionName,
    }));
    const secretJson = secret.SecretString ? JSON.parse(secret.SecretString) : {};
    const untypedResult = {
      ...process.env,
      ...secretJson,
    };
    const result: C = Object.entries(untypedResult).reduce((record, [key, value]) => {
      return {
        ...record,
        [key]: value,
      };
    }, Object.assign({}));
    return Promise.resolve(result);
  }

  async load() {
    if (!this.config) {
      this.config = await this.loadConfig(this.context);
    }
  }

  get(key: keyof C): C[typeof key] {
    if (this.config) {
      if (this.config[key]) {
        return this.config[key];
      } else {
        throw new Error(`Config for ${String(key)} was not found`);
      }
    } else {
      throw new Error('Please invoke the .load() method before attempting to access config values.');
    }
  }
}
