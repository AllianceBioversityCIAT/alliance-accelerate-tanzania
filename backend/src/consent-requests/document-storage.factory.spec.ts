import { createDocumentStorage } from './document-storage.factory';
import { S3DocumentStorage } from './s3-document-storage';
import { UnconfiguredDocumentStorage } from './unconfigured-document-storage';

describe('createDocumentStorage', () => {
  it('selects S3 when CONSENT_DOCUMENTS_BUCKET is set', () => {
    const storage = createDocumentStorage({ CONSENT_DOCUMENTS_BUCKET: 'some-bucket' });
    expect(storage).toBeInstanceOf(S3DocumentStorage);
    expect(storage.enabled).toBe(true);
  });

  it.each([[undefined], [''], ['   ']])('selects the unconfigured adapter when the variable is %p', (value) => {
    const storage = createDocumentStorage({ CONSENT_DOCUMENTS_BUCKET: value });
    expect(storage).toBeInstanceOf(UnconfiguredDocumentStorage);
    expect(storage.enabled).toBe(false);
  });
});
