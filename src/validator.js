const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

function throwHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;

}
function validateJobClientType(profileType) {
    if (profileType !== 'client') {
        throwHttpError(403, 'Only clients can pay for a job');
    }
}

function validatePayJob(job) {
    if (!job) {
        throwHttpError(404, 'Job not found');
    } else if (job.paid) {
        throwHttpError(400, 'Job is already paid');
    } else if (job.price > job.Contract.Client.balance) {
        throwHttpError(400, 'Not enough balance to pay for this job');
    }
};

function validateDepositBalance(user, depositValue) {
    if (!user) {
        throwHttpError(404, 'User not found');
    } else if (user.type !== 'client') {
        throwHttpError(400, 'User is not a client');
    } else if (!depositValue || depositValue <= 0) {
        throwHttpError(400, 'Deposit value is invalid (should be > 0)');
    } else {
        const totalJobsToPayAmount = user.Client.reduce((sum, contract) => {
            const contractJobsSum = contract.Jobs.reduce((currentSum, job) => currentSum + job.price, 0);
            return sum + contractJobsSum;
        }, 0);

        if (depositValue > (0.25 * totalJobsToPayAmount)) {
            throwHttpError(400, `Client can't deposit more than 25% his total of jobs to pay (${totalJobsToPayAmount})`);
        }
    }
}

function validateDates(dates) {
    for (const date of dates) {
        if (!dayjs(date, 'YYYY-MM-DD', true).isValid()) {
            throwHttpError(400, `Invalid date: ${date}`);
        }
    }
}

module.exports = { validateJobClientType, validatePayJob, validateDepositBalance, validateDates };