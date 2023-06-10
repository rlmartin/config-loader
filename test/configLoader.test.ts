import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { ConfigLoader } from '../src/configLoader';

describe('ConfigLoader', () => {
  const OLD_ENV = process.env;
  const ssmMock = mockClient(SecretsManagerClient);

  beforeEach(() => {
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
    ssmMock.reset();
    ssmMock.on(GetSecretValueCommand).resolves({ SecretString: undefined });
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
    expect(config.get('FOO')).toEqual('bar');
  });

  test('loads secrets when $ref from process.env', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested',
    }).resolves({ SecretString: 'bar' });
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = '{"$ref": "nested" }';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual('bar');
  });

  test('fails if missing from process.env', async () => {
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO1 = 'bar';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(() => config.get('FOO')).toThrowError(/Config for FOO was not found/);
  });

  test('loads from Secrets Manager', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual('bar');
  });

  test('recursively loads value from Secrets Manager', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":{"$ref":"nested"}}' });
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested',
    }).resolves({ SecretString: 'bar' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual('bar');
  });

  test('recursively loads array from Secrets Manager', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":[{"$ref":"nested1"}, {"$ref":"nested2"}, "bar3"]}' });
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested1',
    }).resolves({ SecretString: 'bar1' });
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested2',
    }).resolves({ SecretString: 'bar2' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual(['bar1', 'bar2', 'bar3']);
  });

  test('recursively loads object from Secrets Manager', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":{"$ref":"nested1"}}' });
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested1',
    }).resolves({ SecretString: '{"bar":{"$ref":"nested2"},"a":"b"}' });
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'nested2',
    }).resolves({ SecretString: 'baz' });
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    console.log(config.get('FOO'));
    expect(config.get('FOO')).toStrictEqual({ bar: 'baz', a: 'b' });
  });

  test('loads from all', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
      readonly BAL: string;
    }
    process.env.BAL = 'baz';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual('bar');
    expect(config.get('BAL')).toEqual('baz');
  });

  test('secret takes precedence over env', async () => {
    ssmMock.on(GetSecretValueCommand, {
      SecretId: 'foo-bar',
    }).resolves({ SecretString: '{"FOO":"bar"}' });
    interface Test {
      readonly FOO: string;
    }
    process.env.FOO = 'baz';
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    await config.load();
    expect(config.get('FOO')).toEqual('bar');
  });

  test('fails if load() is not invoked', async () => {
    interface Test {
      readonly FOO: string;
    }
    const config = new ConfigLoader<Test>(createContext('foo-bar'));
    expect(() => config.get('FOO')).toThrowError(/Please invoke the .load\(\) method/);
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
