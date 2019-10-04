const zlib = require('zlib');
const get = require('lodash.get');
const Joi = require('joi-strict');

module.exports.S3 = ({ call }) => {
  const putGzipObject = ({ bucket, key, data }) => call('s3:putObject', {
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
    Bucket: bucket,
    Key: key,
    Body: zlib.gzipSync(data, { level: 9 })
  });

  const getGzipObject = ({ bucket, key, expectedErrorCodes }) => call(
    's3:getObject',
    { Bucket: bucket, Key: key },
    { expectedErrorCodes }
  ).then((r) => (expectedErrorCodes.includes(r) ? r : JSON.parse(zlib.gunzipSync(r.Body).toString('utf8'))));

  const headObject = ({ bucket, key, expectedErrorCodes }) => call(
    's3:headObject',
    { Bucket: bucket, Key: key },
    { expectedErrorCodes }
  );

  const deleteObject = ({ bucket, key, expectedErrorCodes }) => call(
    's3:deleteObject',
    { Bucket: bucket, Key: key },
    { expectedErrorCodes }
  );

  const listObjects = async (kwargs) => {
    Joi.assert(kwargs, Joi.object().keys({
      bucket: Joi.string(),
      limit: Joi.number().integer().min(1).optional(),
      startAfter: Joi.string().optional(),
      prefix: Joi.string().optional(),
      continuationToken: Joi.string().optional()
    }));
    const bucket = get(kwargs, 'bucket');
    const limit = get(kwargs, 'limit');
    const startAfter = get(kwargs, 'startAfter');
    const prefix = get(kwargs, 'prefix');
    let continuationToken = get(kwargs, 'continuationToken');

    const result = [];
    let isTruncated;
    do {
      // eslint-disable-next-line no-await-in-loop
      const response = await call('s3:listObjectsV2', {
        Bucket: bucket,
        ...(limit === undefined ? {} : { MaxKeys: Math.min(1000, limit - result.length) }),
        ...(prefix === undefined ? {} : { Prefix: prefix }),
        ...(continuationToken === undefined && startAfter !== undefined
          ? { StartAfter: startAfter }
          : {}),
        ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken })
      });
      result.push(...response.Contents);
      continuationToken = response.NextContinuationToken;
      isTruncated = response.IsTruncated;
    } while (isTruncated === true && (limit === undefined || result.length < limit));
    result.continuationToken = continuationToken;
    result.isTruncated = isTruncated;
    return result;
  };

  // https://stackoverflow.com/questions/39465220#answer-42184248
  const decodeKey = (key) => decodeURIComponent(key.replace(/\+/g, ' '));

  return {
    putGzipObject,
    getGzipObject,
    headObject,
    deleteObject,
    listObjects,
    decodeKey
  };
};
