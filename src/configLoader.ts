import { parse } from '@aws-sdk/util-arn-parser';
import { Context } from 'aws-lambda';
import { loadSecretJson } from './helpers/secrets';

export class ConfigLoader<C> {
  context: Context;
  config?: C;

  constructor(context: Context) {
    this.context = context;
  }

  private async loadConfig(context: Context): Promise<C> {
    const region = process.env.AWS_REGION ?? parse(context.invokedFunctionArn).region;
    const secretJson = await loadSecretJson(context.functionName, region);
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
