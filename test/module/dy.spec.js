const expect = require('chai').expect;
const { DynamoDB } = require('aws-sdk');
const { describe } = require('node-tdd');
const Index = require('../../src');
const DyUtil = require('../../src/module/dy');
const { LocalTable } = require('../dy-helper');
const { ModelNotFound } = require('../../src/resources/errors');

const { DocumentClient } = DynamoDB;

describe('Testing dy Util', {
  useNock: true,
  nockStripHeaders: true,
  envVarsFile: '../default.env.yml'
}, () => {
  let Model;
  let model;
  let localTable;
  let item;
  let primaryKey;

  before(() => {
    primaryKey = '123';
  });
  beforeEach(async () => {
    const index = Index({
      config: {
        maxRetries: 0,
        endpoint: process.env.DYNAMODB_ENDPOINT
      }
    });
    Model = (opts) => DyUtil({
      call: index.call,
      logger: null,
      getService: index.get
    }).Model(opts);
    model = Model({
      name: 'table-name',
      attributes: {
        id: { type: 'string', partitionKey: true },
        name: { type: 'string', sortKey: true },
        age: { type: 'number', default: 30 },
        num: { type: 'number', default: 30 }
      },
      indices: {
        targetIndex: {
          partitionKey: 'id',
          sortKey: 'name'
        }
      },
      DocumentClient: new DocumentClient({
        endpoint: process.env.DYNAMODB_ENDPOINT
      })
    });
    localTable = LocalTable(model);
    await localTable.create();
    item = {
      id: primaryKey,
      name: 'name',
      age: 50,
      num: 50
    };
  });
  afterEach(async () => {
    await localTable.delete();
  });

  it('Testing basic logic', () => {
    expect(Object.keys(model)).to.deep.equal([
      'upsert',
      'update',
      'getItem',
      'query',
      'schema'
    ]);
  });

  it('Testing upsert item created', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
  });

  it('Testing upsert with default', async () => {
    delete item.age;
    delete item.num;
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.getItem(item);
    expect(result).to.deep.equal({
      ...item,
      age: 30,
      num: 30
    });
  });

  it('Testing upsert item updated', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 51;
    expect(await model.upsert(item)).to.deep.equal({ created: false });
  });

  it('Testing upsert with conditions', async () => {
    const result = await model.upsert(item, { conditions: { attr: 'name', exists: false } });
    expect(result).to.deep.equal({ created: true });
  });

  it('Testing upsert with ConditionalCheckFailedException', async ({ capture }) => {
    const error = await capture(() => model.upsert(item, { conditions: { attr: 'name', exists: true } }));
    expect(error.code).to.equal('ConditionalCheckFailedException');
  });

  it('Testing getItem', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.getItem(item);
    expect(result).to.deep.equal(item);
  });

  it('Testing getItem throws ModelNotFound error', async ({ capture }) => {
    const error = await capture(() => model.getItem(item));
    expect(error).instanceof(ModelNotFound);
  });

  it('Testing getItem with toReturn', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.getItem(item, { toReturn: ['name'] });
    expect(result).to.deep.equal({ name: 'name' });
  });

  it('Testing getItem with stubbed defaults', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.getItem(item, { toReturn: ['age', 'num'] });
    expect(result).to.deep.equal({
      age: 30,
      num: 30
    });
  });

  it('Testing update', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 55;
    const result = await model.update(item);
    expect(result).to.deep.equal(item);
  });

  it('Testing update with conditions', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 55;
    const result = await model.update(item, { conditions: { attr: 'age', eq: 50 } });
    expect(result).to.deep.equal(item);
  });

  it('Testing update with conditions as array', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 55;
    const result = await model.update(item, { conditions: [{ attr: 'age', eq: 50 }] });
    expect(result).to.deep.equal(item);
  });

  it('Testing update with returnValues', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.update({
      ...item,
      age: 55
    }, { returnValues: 'none' });
    expect(result).to.equal(undefined);
  });

  it('Testing update with item not found with conditions', async ({ capture }) => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 55;
    const error = await capture(() => model.update(item, { conditions: { attr: 'age', eq: 10 } }));
    expect(error).instanceof(ModelNotFound);
  });

  it('Testing update with unknown error', async ({ capture }) => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    item.age = 55;
    const error = await capture(() => model.update(item, { conditions: { attr: 'age', eq: 10 } }));
    expect(error.code).to.equal('UnknownError');
  });

  it('Testing update with item does not exist', async ({ capture }) => {
    const error = await capture(() => model.update(item));
    expect(error).instanceof(ModelNotFound);
  });

  it('Testing query', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.query(primaryKey);
    expect(result).to.deep.equal({
      payload: [item],
      page: {
        next: null,
        index: { current: 1 },
        size: 20
      }
    });
  });

  it('Testing query with limit', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    expect(await model.upsert({
      id: primaryKey,
      name: 'name-2',
      age: 25
    })).to.deep.equal({ created: true });
    const result = await model.query(primaryKey, { limit: 1 });
    expect(result).to.deep.equal({
      payload: [item],
      page: {
        next: {
          limit: 1,
          // eslint-disable-next-line max-len
          cursor: 'eyJsaW1pdCI6MSwic2NhbkluZGV4Rm9yd2FyZCI6dHJ1ZSwibGFzdEV2YWx1YXRlZEtleSI6eyJuYW1lIjoibmFtZSIsImlkIjoiMTIzIn0sImN1cnJlbnRQYWdlIjoyfQ=='
        },
        index: { current: 1 },
        size: 1
      }
    });
  });

  it('Testing query with toReturn', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.query(primaryKey, { toReturn: ['name'] });
    expect(result).to.deep.equal({
      payload: [{ name: 'name' }],
      page: {
        next: null,
        index: { current: 1 },
        size: 20
      }
    });
  });

  it('Testing query with index', async () => {
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    const result = await model.query(primaryKey, {
      index: 'targetIndex',
      consistent: false
    });
    expect(result).to.deep.equal({
      payload: [item],
      page: {
        next: null,
        index: { current: 1 },
        size: 20
      }
    });
  });

  it('Testing query with cursor', async () => {
    const secondItem = {
      ...item,
      name: 'name-2'
    };
    const thirdItem = {
      ...item,
      name: 'name-3'
    };
    expect(await model.upsert(item)).to.deep.equal({ created: true });
    expect(await model.upsert(secondItem)).to.deep.equal({ created: true });
    expect(await model.upsert(thirdItem)).to.deep.equal({ created: true });
    const firstResult = await model.query(primaryKey, { limit: 2 });
    expect(firstResult).to.deep.equal({
      payload: [item, secondItem],
      page: {
        next: {
          limit: 2,
          // eslint-disable-next-line max-len
          cursor: 'eyJsaW1pdCI6Miwic2NhbkluZGV4Rm9yd2FyZCI6dHJ1ZSwibGFzdEV2YWx1YXRlZEtleSI6eyJuYW1lIjoibmFtZS0yIiwiaWQiOiIxMjMifSwiY3VycmVudFBhZ2UiOjJ9'
        },
        index: { current: 1 },
        size: 2
      }
    });
    const secondResult = await model.query(primaryKey, { cursor: firstResult.page.next.cursor });
    expect(secondResult).to.deep.equal({
      payload: [thirdItem],
      page: {
        next: null,
        index: { current: 2 },
        size: 2
      }
    });
  });

  it('Testing schema', ({ fixture }) => {
    const result = model.schema;
    expect(result).to.deep.equal(fixture('table-schema'));
  });
});
