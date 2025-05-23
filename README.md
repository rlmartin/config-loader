# ConfigLoader
Utility class/functions to help load config from various sources.

Initial implementation narrowly supports AWS Lambda, but may be expanded to additional uses cases in the future.


## Usage
The `ConfigLoader` class takes a type argument to strongly define the expected config variable names. Because the config can be loaded from multiple sources, there is no check of the existence of every variable _until is is attempted to be used_.

To use the loader, create a small file like this:

```typescript
import { Context } from 'aws-lambda';
import { ConfigLoader } from '@rlmartin/config-loader';

export interface Config {
  readonly FOO: string;
  readonly BAR: string;
}

var config: ConfigLoader<Config>;

export async function loadConfig(context: Context) {
  config = new ConfigLoader<Config>(context);
  await config.load();
}

export function getConfig(key: keyof Config): Config[typeof key] {
  return config.get(key);
}
```

then when config is needed:

```typescript
import { Context, S3Event } from 'aws-lambda';
import { getConfig, loadConfig } from './config';

export async function handler(event: S3Event, context: Context): Promise<void> {
  await loadConfig(context);
  const foo = getConfig('FOO');
  // ...
}
```


## Supported config sources
The config is loaded from all of the following sources, in order of precedence (higher will override lower):

1. Secrets Manager
2. Environment variables (`process.env`)


## Secret name
The secret name matches the AWS Lambda function name. This can be overridden by setting the `SECRET_NAME` environment variable, which should be set to _only_ the name of the secret (not the ARN).


## Nested secrets
It is possible to load values from other secrets by setting the value to:

```
{
  'propertyName': { '$ref':'secretName' }
}
```

where `secretName` is the name of the secret that should be loaded as the value for `propertyName`. The value in the dependent secret can be any value (JSON or otherwise). This loading is recursive.

Be careful to not load too many dependent secrets and/or nest too deeply - because a) SecretsManager pricing is based on the number of secrets loaded and b) it could adversely affect load times.

This same secret-loading process can be utilized by env vars, e.g.

```
process.env['propertyName'] = '{"$ref":"secretName"}';
```
