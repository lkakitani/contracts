
const validator = require('../src/validator');

describe('validation functions', () => {
  it('validateJobClientType', () => {
    expect(() => validator.validateJobClientType('client')).not.toThrow();
    expect(() => validator.validateJobClientType('contractor')).toThrow('Only clients can pay for a job');
  });

  it('validatePayJob', () => {
    let job = {
      id: 2,
      description: "work",
      price: 201,
      paid: null,
      paymentDate: null,
      ContractId: 2,
      Contract: {
        id: 2,
        terms: "bla bla bla",
        status: "in_progress",
        ContractorId: 6,
        ClientId: 1,
        Client: {
          id: 1,
          firstName: "Harry",
          lastName: "Potter",
          profession: "Wizard",
          balance: 1250,
          type: "client",
        },
        Contractor: {
          id: 6,
          firstName: "Linus",
          lastName: "Torvalds",
          profession: "Programmer",
          balance: 1214,
          type: "contractor",
        }
      }
    };
    expect(() => validator.validatePayJob(job)).not.toThrow();
    expect(() => validator.validatePayJob(undefined)).toThrow('Job not found');
    job.paid = true;
    expect(() => validator.validatePayJob(job)).toThrow('Job is already paid');
    job.paid = false;
    job.price = 3000;
    expect(() => validator.validatePayJob(job)).toThrow('Not enough balance to pay for this job');
  });

  it('validateDepositBalance', () => {
    let user = {
      id: 1,
      firstName: "Harry",
      lastName: "Potter",
      profession: "Wizard",
      balance: 1150,
      type: "client",
      Client: [
        {
          id: 1,
          terms: "bla bla bla",
          status: "terminated",
          ContractorId: 5,
          ClientId: 1,
          Jobs: [
            {
              id: 1,
              description: "work",
              price: 200,
              paid: null,
              paymentDate: null,
              ContractId: 1
            }
          ]
        },
        {
          id: 2,
          terms: "bla bla bla",
          status: "in_progress",
          ContractorId: 6,
          ClientId: 1,
          Jobs: [
            {
              id: 2,
              description: "work",
              price: 201,
              paid: null,
              paymentDate: null,
              ContractId: 2
            }
          ]
        }
      ]
    };
    expect(() => validator.validateDepositBalance(user, 100)).not.toThrow();
    expect(() => validator.validateDepositBalance(undefined)).toThrow('User not found');
    user.type = 'contractor';
    expect(() => validator.validateDepositBalance(user, 100)).toThrow('User is not a client');
    user.type = 'client';
    expect(() => validator.validateDepositBalance(user, -200)).toThrow('Deposit value is invalid (should be > 0)');
    expect(() => validator.validateDepositBalance(user, 400)).toThrow(`Client can't deposit more than 25% his total of jobs to pay (401)`);
  });

  it('validateDates', () => {
    expect(() => validator.validateDates(['2010-01-01', '2020-12-31'])).not.toThrow();
    expect(() => validator.validateDates(['2010-01-01', '2020-02-31'])).toThrow('Invalid date: 2020-02-31');
    expect(() => validator.validateDates(['123456'])).toThrow('Invalid date: 123456');
  });
});