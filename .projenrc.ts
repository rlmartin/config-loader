import { typescript } from 'projen';
import { NpmAccess } from 'projen/lib/javascript';

const majorVersion = 1;
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@rlmartin/config-loader',
  projenrcTs: true,
  releaseToNpm: true,
  npmAccess: NpmAccess.PUBLIC,
  majorVersion,
  releaseBranches: {
    dev: { prerelease: 'dev', npmDistTag: 'dev', majorVersion },
  },
  depsUpgradeOptions: {
    workflowOptions: {
      branches: ['main'],
    },
  },
  deps: [
    '@aws-sdk/client-secrets-manager@~3',
    '@aws-sdk/client-ssm@~3',
    '@aws-sdk/util-arn-parser@~3',
    '@types/aws-lambda@~8',
  ],
  devDeps: [
    'aws-sdk-client-mock@~2',
  ],

  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();