import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { ConfigLoader } from '../src/configLoader';

describe('ConfigLoader', () => {
  const OLD_ENV = process.env;
  const secretsMock = mockClient(SecretsManagerClient);
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
    secretsMock.reset();
    secretsMock.on(GetSecretValueCommand).resolves({ SecretString: undefined });
    ssmMock.reset();
    ssmMock.on(GetParametersCommand).resolves({ Parameters: undefined });
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('loads from process.env', async () => {
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = 'bar';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('loads secrets when $ref from process.env', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested',
    }).resolves({ SecretString: 'bar' });
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = '{"$ref": "nested" }';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('fails if missing from process.env', async () => {
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO1 = 'bar';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
  });

  test('loads from Secrets Manager', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('recursively loads value from Secrets Manager', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":{"$ref":"nested"}}' });
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested',
    }).resolves({ SecretString: 'bar' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('recursively loads array from Secrets Manager', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":[{"$ref":"nested1"}, {"$ref":"nested2"}, "bar3"]}' });
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested1',
    }).resolves({ SecretString: 'bar1' });
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested2',
    }).resolves({ SecretString: 'bar2' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual(['bar1', 'bar2', 'bar3']);
  });

  test('recursively loads object from Secrets Manager', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":{"$ref":"nested1"}}' });
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested1',
    }).resolves({ SecretString: '{"bar":{"$ref":"nested2"},"a":"b"}' });
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'nested2',
    }).resolves({ SecretString: 'baz' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toStrictEqual({ bar: 'baz', a: 'b' });
  });

  test('loads from Parameter Store', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).resolves({ Parameters: [{ Name: 'FOO', Type: 'String', Value: 'bar' }] });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('loads from Parameter Store with prefix', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['dev/FOO'],
    }).resolves({ Parameters: [{ Name: 'dev/FOO', Type: 'String', Value: 'bar' }] });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'), { parameterStorePrefix: 'dev/' });
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('only loads from Parameter Store once', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).resolvesOnce({ Parameters: [{ Name: 'FOO', Type: 'String', Value: 'bar' }] })
      .rejects('Should not invoke parameter store multiple times.');
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    var foo = await config.get('FOO');
    expect(foo).toEqual('bar');
    foo = await config.get('FOO');
    expect(foo).toEqual('bar');
    foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('only loads from Parameter Store once, when parameter is missing', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).resolvesOnce({ InvalidParameters: ['FOO'] })
      .rejects('Should not invoke parameter store multiple times.');
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
  });

  test('loads from all', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    ssmMock.on(GetParametersCommand, {
      Names: ['BAZ'],
    }).resolves({ Parameters: [{ Name: 'BAZ', Type: 'String', Value: 'boo' }] });
    interface Test {
      readonly FOO: string;
    }
    interface Test {
      readonly FOO: string;
      readonly BAL: string;
      readonly BAZ: string;
    }
    process.env.BAL = 'baz';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    const bal = await config.get('BAL');
    const baz = await config.get('BAZ');
    expect(foo).toEqual('bar');
    expect(bal).toEqual('baz');
    expect(baz).toEqual('boo');
  });

  test('secret takes precedence over env', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = 'baz';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('secret does not load from parameter store if env already specifies', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).rejects('Should not invoke parameter store at all');
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = 'bar';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
  });

  test('secret does not load from parameter store if secret already specifies', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
    }
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).rejects('Should not invoke parameter store at all');
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    const foo = await config.get('FOO');
    expect(foo).toEqual('bar');
    secretsMock.calls;
  });

  test('skips loading from parameter store when specified', async () => {
    ssmMock.on(GetParametersCommand, {
      Names: ['FOO'],
    }).rejects('Should not invoke parameter store.');
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'), { skip: { parameterStore: true } });
    await config.load();
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
  });

  test('skips loading from secrets manager when specified', async () => {
    secretsMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).rejects('Should not invoke secrets manager.');
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'), { skip: { secretsManager: true } });
    await config.load();
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
    await expect(async () => config.get('FOO')).rejects.toThrow(/Config for FOO was not found/);
  });

  test('fails if load() is not invoked', async () => {
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await expect(async () => config.get('FOO')).rejects.toThrow(/Please invoke the .load\(\) method/);
  });

});

function createContext(functionName: string): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName,
    functionVersion: '1.0.0',
    getRemainingTimeInMillis: () => { return 10;},
    invokedFunctionArn: `arn:::us-east-1:0000000000:${functionName}`,
    memoryLimitInMB: '32',
    awsRequestId: '1234',
    logGroupName: `/aws/lambda/${functionName}`,
    logStreamName: `/aws/lambda/${functionName}`,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}
