import { parse } from '@aws-sdk/util-arn-parser';
import { Context } from 'aws-lambda';
import { getParameterValues } from './helpers/parameterStore';
import { loadSecretJson, recursivelyLoadObject } from './helpers/secrets';

export interface ConfigLoaderOptions {
  /**
   * Used as a prefix to prepend to all Parameter Store names when
   * searching for config.
   * @default - no prefix
   */
  readonly parameterStorePrefix?: string;
  /**
   * Optional configuration used to avoid loading from various sources
   * when parameters are missing. Can be used for efficiency.
   * @default - load from all sources
   */
  readonly skip?: {
    readonly secretsManager?: boolean;
    readonly parameterStore?: boolean;
  };
}

export class ConfigLoader<C> {
  attemptedParamStore: Partial<Record<keyof C, boolean>>;
  context: Context;
  config?: C;
  options: ConfigLoaderOptions;
  region: string | undefined;

  constructor(context: Context, options: ConfigLoaderOptions = {}) {
    this.context = context;
    this.options = options;
    this.attemptedParamStore = {};
  }

  private async loadConfig(context: Context): Promise<C> {
    this.region = process.env.AWS_REGION ?? parse(context.invokedFunctionArn).region;
    const envJson = await recursivelyLoadObject(process.env, this.region);
    const secretJson = this.options.skip?.secretsManager ? {} : await loadSecretJson(process.env.SECRET_NAME ?? context.functionName, this.region);
    const untypedResult = {
      ...envJson,
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

  async get<T extends keyof C>(key: T): Promise<C[T]> {
    if (this.config) {
      if (!this.config[key] && !this.attemptedParamStore[key] && !this.options.skip?.parameterStore) {
        const params = await getParameterValues<C>([key], this.region, this.options.parameterStorePrefix);
        this.config[key] = params[key] as any;
        this.attemptedParamStore[key] = true;
      }
      if (this.config[key]) {
        return Promise.resolve(this.config[key]);
      } else {
        throw new Error(`Config for ${String(key)} was not found`);
      }
    } else {
      throw new Error('Please invoke the .load() method before attempting to access config values.');
    }
  }
}
