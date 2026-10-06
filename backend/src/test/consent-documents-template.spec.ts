import { readFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

/**
 * actors/consent-intake/consent-request-email T-7 — static assertions over the
 * REAL `infra/20-backend/template.yaml` (NFR-8; design.md §7.4). The template
 * is parsed (CloudFormation short-form tags included), never grepped, so a
 * reordered or re-indented file cannot hide a loosened grant.
 *
 * What this cannot prove: that IAM and the bucket behave as written once
 * deployed. That has no automated gate (mocked SDK); T-14's real upload and
 * download on DEV is the substitute (NFR-8 declared gap).
 */

const TEMPLATE_PATH = join(__dirname, '../../../infra/20-backend/template.yaml');

const CFN_TAGS: Array<[string, string]> = [
  ['Ref', 'Ref'],
  ['Sub', 'Fn::Sub'],
  ['GetAtt', 'Fn::GetAtt'],
  ['If', 'Fn::If'],
  ['Not', 'Fn::Not'],
  ['Equals', 'Fn::Equals'],
  ['ImportValue', 'Fn::ImportValue'],
  ['Join', 'Fn::Join'],
  ['Select', 'Fn::Select'],
  ['Split', 'Fn::Split'],
];
const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend(
  CFN_TAGS.flatMap(([tag, key]) =>
    (['scalar', 'sequence', 'mapping'] as const).map(
      (kind) => new yaml.Type(`!${tag}`, { kind, construct: (data: unknown) => ({ [key]: data }) }),
    ),
  ),
);

type Node = Record<string, any>;
const template = yaml.load(readFileSync(TEMPLATE_PATH, 'utf8'), { schema: CFN_SCHEMA }) as Node;
const resources = template.Resources as Node;
const bucket = resources.ConsentDocumentsBucket as Node;
const bucketProps = bucket.Properties as Node;
const logBucket = resources.ConsentDocumentsLogBucket as Node;
const logProps = logBucket.Properties as Node;
const apiFunction = resources.ApiFunction.Properties as Node;

/** Every IAM statement of ApiFunction, flattened across `Policies` entries. */
const statements: Node[] = (apiFunction.Policies as Node[]).flatMap((p) => (p.Statement as Node[]) ?? []);
const asList = (v: unknown): any[] => (Array.isArray(v) ? v : [v]);
/** The statements that mention the documents bucket in their Resource. */
const bucketStatements = statements.filter((st) => JSON.stringify(st.Resource).includes('ConsentDocumentsBucket'));
const actionsOf = (st: Node): string[] => asList(st.Action) as string[];

describe('infra/20-backend ConsentDocumentsBucket', () => {
  it('is a retained bucket: DeletionPolicy and UpdateReplacePolicy both Retain (DD-12)', () => {
    expect(bucket.Type).toBe('AWS::S3::Bucket');
    expect(bucket.DeletionPolicy).toBe('Retain');
    expect(bucket.UpdateReplacePolicy).toBe('Retain');
  });

  it('is named from the pseudo-parameters, with no 12-digit account literal anywhere in the resource', () => {
    expect(bucketProps.BucketName).toEqual({ 'Fn::Sub': '${AWS::StackName}-consent-docs-${AWS::AccountId}' });
    expect(JSON.stringify(bucket)).not.toMatch(/\d{12}/);
  });

  it('turns on all four Block Public Access settings and disables ACLs', () => {
    expect(bucketProps.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(bucketProps.OwnershipControls).toEqual({ Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] });
  });

  it('encrypts by default with AES256 and versions objects', () => {
    expect(bucketProps.BucketEncryption.ServerSideEncryptionConfiguration).toEqual([
      { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
    ]);
    expect(bucketProps.VersioningConfiguration).toEqual({ Status: 'Enabled' });
  });

  it('has exactly ONE lifecycle rule, on incoming/: 1 d current, 1 d noncurrent, 1 d multipart abort, and no stored/ expiry', () => {
    const rules = bucketProps.LifecycleConfiguration.Rules as Node[];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      Status: 'Enabled',
      Prefix: 'incoming/',
      ExpirationInDays: 1,
      NoncurrentVersionExpiration: { NoncurrentDays: 1 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    });
    // ExpiredObjectDeleteMarker cannot share a rule with Days (S3 removes them itself).
    expect(JSON.stringify(rules)).not.toContain('ExpiredObjectDeleteMarker');
  });

  it('allows a cross-origin POST only, from AllowedOrigin (plus LegacyAllowedOrigin when set)', () => {
    const rules = bucketProps.CorsConfiguration.CorsRules as Node[];
    expect(rules).toHaveLength(1);
    expect(rules[0].AllowedMethods).toEqual(['POST']);
    expect(rules[0].AllowedHeaders).toEqual(['*']);
    expect(rules[0].MaxAge).toBe(600);
    expect(rules[0].AllowedOrigins).toEqual({
      'Fn::If': [
        'HasLegacyAllowedOrigin',
        [{ Ref: 'AllowedOrigin' }, { Ref: 'LegacyAllowedOrigin' }],
        [{ Ref: 'AllowedOrigin' }],
      ],
    });
  });

  it('carries the same two tags as FrontendBucket', () => {
    expect(bucketProps.Tags).toEqual([
      { Key: 'project', Value: 'accelerate-tz' },
      { Key: 'environment', Value: 'dev' },
    ]);
  });
});

describe('infra/20-backend ConsentDocumentsBucketPolicy', () => {
  it('denies every s3 action over a non-TLS connection, on the bucket and its objects', () => {
    const policy = resources.ConsentDocumentsBucketPolicy.Properties as Node;
    expect(policy.Bucket).toEqual({ Ref: 'ConsentDocumentsBucket' });
    const deny = (policy.PolicyDocument.Statement as Node[]).find((st) => st.Effect === 'Deny')!;
    expect(deny).toMatchObject({
      Principal: '*',
      Action: 's3:*',
      Condition: { Bool: { 'aws:SecureTransport': 'false' } },
    });
    expect(deny.Resource).toEqual([
      { 'Fn::GetAtt': 'ConsentDocumentsBucket.Arn' },
      { 'Fn::Sub': '${ConsentDocumentsBucket.Arn}/*' },
    ]);
  });
});

describe('infra/20-backend ConsentDocumentsLogBucket (S3 access logging, S6258)', () => {
  it('the documents bucket logs to it under access/', () => {
    expect(bucketProps.LoggingConfiguration).toEqual({
      DestinationBucketName: { Ref: 'ConsentDocumentsLogBucket' },
      LogFilePrefix: 'access/',
    });
  });

  it('is retained, named from pseudo-parameters, private, BucketOwnerEnforced and AES256 (no KMS)', () => {
    expect(logBucket.DeletionPolicy).toBe('Retain');
    expect(logBucket.UpdateReplacePolicy).toBe('Retain');
    expect(logProps.BucketName).toEqual({ 'Fn::Sub': '${AWS::StackName}-consent-docs-logs-${AWS::AccountId}' });
    expect(JSON.stringify(logBucket)).not.toMatch(/\d{12}/);
    expect(logProps.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(logProps.OwnershipControls).toEqual({ Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] });
    expect(logProps.BucketEncryption.ServerSideEncryptionConfiguration).toEqual([
      { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
    ]);
    expect(logProps.VersioningConfiguration).toBeUndefined();
  });

  it('expires logs after 365 days with a single rule', () => {
    const rules = logProps.LifecycleConfiguration.Rules as Node[];
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ Status: 'Enabled', ExpirationInDays: 365 });
  });

  it('policy lets only the S3 logging service put access/* for this bucket and account, and denies non-TLS', () => {
    const policy = resources.ConsentDocumentsLogBucketPolicy.Properties as Node;
    expect(policy.Bucket).toEqual({ Ref: 'ConsentDocumentsLogBucket' });
    const sts = policy.PolicyDocument.Statement as Node[];
    expect(sts).toHaveLength(2);
    const allow = sts.find((st) => st.Effect === 'Allow')!;
    expect(allow).toEqual({
      Sid: 'AllowS3ServerAccessLogDelivery',
      Effect: 'Allow',
      Principal: { Service: 'logging.s3.amazonaws.com' },
      Action: 's3:PutObject',
      Resource: { 'Fn::Sub': '${ConsentDocumentsLogBucket.Arn}/access/*' },
      Condition: {
        ArnLike: { 'aws:SourceArn': { 'Fn::GetAtt': 'ConsentDocumentsBucket.Arn' } },
        StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
      },
    });
    expect(sts.find((st) => st.Effect === 'Deny')).toMatchObject({
      Principal: '*',
      Action: 's3:*',
      Condition: { Bool: { 'aws:SecureTransport': 'false' } },
    });
  });

  it('the ApiFunction role has no statement on the log bucket', () => {
    expect(statements.filter((st) => JSON.stringify(st).includes('ConsentDocumentsLogBucket'))).toHaveLength(0);
  });
});

describe('infra/20-backend ApiFunction access to the documents bucket', () => {
  it('receives the bucket name through CONSENT_DOCUMENTS_BUCKET', () => {
    expect(apiFunction.Environment.Variables.CONSENT_DOCUMENTS_BUCKET).toEqual({ Ref: 'ConsentDocumentsBucket' });
  });

  const listStatements = bucketStatements.filter((st) => actionsOf(st).includes('s3:ListBucket'));
  const objectStatements = bucketStatements.filter((st) => !actionsOf(st).includes('s3:ListBucket'));

  it('finds the grants (guards the derivation going vacuous)', () => {
    expect(objectStatements).toHaveLength(2);
    expect(listStatements).toHaveLength(1);
  });

  it('grants exactly put/get/delete on incoming/* and put/get on stored/*, each Allow', () => {
    const byPrefix = Object.fromEntries(
      objectStatements.map((st) => {
        expect(st.Effect).toBe('Allow');
        const resource = (st.Resource as Node)['Fn::Sub'] as string;
        const prefix = /\/(incoming|stored)\/\*$/.exec(resource)?.[1];
        expect(resource).toBe(`\${ConsentDocumentsBucket.Arn}/${prefix}/*`);
        return [prefix, actionsOf(st).sort()];
      }),
    );
    expect(byPrefix).toEqual({
      incoming: ['s3:DeleteObject', 's3:GetObject', 's3:PutObject'],
      stored: ['s3:GetObject', 's3:PutObject'],
    });
  });

  it('grants an unconditioned s3:ListBucket on the bucket ARN only (not /*): HeadObject carries no s3:prefix, so a condition would turn a missing key into 403', () => {
    expect(listStatements[0]).toEqual({
      Effect: 'Allow',
      Action: 's3:ListBucket',
      Resource: { 'Fn::GetAtt': 'ConsentDocumentsBucket.Arn' },
    });
  });

  it('has no wildcard action, no wildcard resource and no DeleteObject on stored/', () => {
    for (const st of bucketStatements) {
      for (const action of actionsOf(st)) expect(action).not.toContain('*');
      expect(JSON.stringify(st.Resource)).not.toBe('"*"');
    }
    const stored = objectStatements.find((st) => JSON.stringify(st.Resource).includes('/stored/'))!;
    expect(actionsOf(stored)).not.toContain('s3:DeleteObject');
  });

  it('exactly one ListBucket statement on ApiFunction, on the bucket ARN', () => {
    const lists = statements.filter((st) => actionsOf(st).includes('s3:ListBucket'));
    expect(lists).toHaveLength(1);
    expect(lists[0].Resource).toEqual({ 'Fn::GetAtt': 'ConsentDocumentsBucket.Arn' });
  });

  it('no statement anywhere on ApiFunction grants an s3 action on a bare "*" resource or an s3:* action', () => {
    for (const st of statements) {
      const s3Actions = actionsOf(st).filter((a) => typeof a === 'string' && a.startsWith('s3:'));
      if (s3Actions.length === 0) continue;
      expect(s3Actions.every((a) => !a.includes('*'))).toBe(true);
      expect(asList(st.Resource)).not.toContain('*');
    }
  });
});
