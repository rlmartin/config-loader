import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

export async function getParameterValues<C>(parameterNames: (keyof C)[], region: string | undefined = undefined, prefix: string = ''): Promise<Partial<Record<keyof C, string | string[]>>> {
  const client = new SSMClient({
    region,
  });
  const input = {
    Names: parameterNames.map(name => `${prefix}${String(name)}`),
  };
  const response = await client.send(new GetParametersCommand(input));
  return (response.Parameters ?? []).reduce((result, param) => {
    if (param.Name) {
      const name = prefix === '' ? param.Name : param.Name.replace(prefix, '');
      const value = param.Value ?? '';
      result[name] = param.DataType === 'StringList' ? value.split(',') : value;
    }
    return result;
  }, Object.assign({}));
}
