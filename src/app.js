const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const { Op } = require('sequelize');
const validator = require('./validator');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);

/**
 * @returns contract by id
 * if contract is not found, it is better to return 403 instead of 404, so user does not know that the contractId exists
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models');
    const { id } = req.params;
    const contract = await Contract.findOne({ where: { id } });
    if (!contract || ![contract.ContractorId, contract.ClientId].includes(req.profile.id)) return res.status(403).end();
    res.json(contract);
});

/**
 * @returns list of non-terminated contracts belonging to a user
 */
app.get('/contracts', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models');
    const userWhereClause = req.profile.type === 'client' ? { ClientId: req.profile.id } : { ContractorId: req.profile.id };
    const contracts = await Contract.findAll({
        where: {
            ...userWhereClause,
            status: ['new', 'in_progress']
        }
    });
    res.json(contracts);
});

/**
 * @returns list of all unpaid jobs for a user, for active contracts only
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const { Job, Contract } = req.app.get('models');
    const userWhereClause = req.profile.type === 'client' ? { ClientId: req.profile.id } : { ContractorId: req.profile.id };
    const jobs = await Job.findAll({
        where: { paid: null },
        include: [{
            model: Contract,
            where: {
                ...userWhereClause,
                status: 'in_progress'
            }
        }]
    });
    res.json(jobs);
});

/**
 * Pay for a job.
 * A client can only pay if his balance >= the amount to pay.
 * The amount should be moved from the client’s balance to the contractor balance.
 */
app.post('/jobs/:job_id/pay', getProfile, async (req, res, next) => {
    try {
        const { Job, Contract, Profile } = req.app.get('models');
        const { job_id: jobId } = req.params;

        validator.validateJobClientType(req.profile.type);

        const job = await Job.findOne({
            where: { id: jobId },
            include: [
                {
                    model: Contract,
                    where: {
                        ClientId: req.profile.id,
                        status: ['new', 'in_progress']
                    },
                    include: [
                        {
                            model: Profile,
                            as: 'Client'
                        },
                        {
                            model: Profile,
                            as: 'Contractor'
                        }
                    ]
                },

            ]
        });

        validator.validatePayJob(job);

        try {
            await sequelize.transaction(async (t) => {
                await job.update({
                    paid: true,
                    paymentDate: new Date(),
                }, { transaction: t });

                await job.Contract.Client.decrement({ balance: job.price }, { transaction: t });
                await job.Contract.Contractor.increment({ balance: job.price }, { transaction: t });
            });

            res.status(201).end();
        } catch (error) {
            res.status(400).send({ message: error });
        }
    } catch (e) {
        next(e);
    }
});

/**
 * Deposits money into the balance of a client.
 * A client can’t deposit more than 25% his total of jobs to pay. (at the deposit moment)
 * Note: any logged in user can perform this action
 */
app.post('/balances/deposit/:user_id', getProfile, async (req, res, next) => {
    try {
        const { Profile, Job, Contract } = req.app.get('models');
        const { user_id: userId } = req.params;
        const depositValue = req.body.value;

        const user = await Profile.findOne({
            where: { id: userId },
            include: [
                {
                    model: Contract,
                    as: 'Client',
                    where: {
                        ClientId: userId
                    },
                    required: false,
                    include: [
                        {
                            model: Job,
                            where: {
                                paid: null,
                            },
                            required: false
                        }
                    ]
                },

            ]
        });

        validator.validateDepositBalance(user, depositValue);

        await user.increment({ balance: depositValue });

        res.status(201).end();
    } catch (e) {
        next(e);
    }
});

/**
 * @returns the profession that earned the most money (sum of jobs paid) for any contractor that worked in the query time range.
 * Note: any logged in user can perform this action
 */
app.get('/admin/best-profession', getProfile, async (req, res, next) => {
    try {
        const { start, end } = req.query;

        validator.validateDates([start, end]);

        const { Profile, Job, Contract } = req.app.get('models');
        const users = await Profile.findAll({
            where: { type: 'contractor' },
            include: [
                {
                    model: Contract,
                    as: 'Contractor',
                    include: [
                        {
                            model: Job,
                            where: {
                                paymentDate: { [Op.between]: [start, end] },
                                paid: true,
                            },
                        }
                    ]
                },

            ]
        });
        const professionMap = {};
        users.forEach(user => {
            const profession = user.profession;
            if (!professionMap[profession]) professionMap[profession] = 0;
            professionMap[profession] += user.Contractor.reduce((sum, contract) => {
                const contractJobsSum = contract.Jobs.reduce((currentSum, job) => currentSum + (job.price || 0), 0);
                return sum + contractJobsSum;
            }, 0);
        });

        const bestProfession = Object.keys(professionMap).reduce((a, b) => professionMap[a] > professionMap[b] ? a : b);

        res.json(professionMap[bestProfession] > 0 ? bestProfession : 'No professions were paid in this time range');
    } catch (e) {
        next(e);
    }
});

/**
 * @returns the clients that paid the most for jobs in the query time period.
 * Default limit is 2
 * Note: any logged in user can perform this action
 */
app.get('/admin/best-clients', getProfile, async (req, res, next) => {
    try {
        const { start, end, limit = 2 } = req.query;

        validator.validateDates([start, end]);

        const { Profile, Job, Contract } = req.app.get('models');
        const users = await Profile.findAll({
            where: { type: 'client' },
            include: [
                {
                    model: Contract,
                    as: 'Client',
                    include: [
                        {
                            model: Job,
                            where: {
                                paymentDate: { [Op.between]: [start, end] },
                                paid: true,
                            },
                        }
                    ]
                },

            ]
        });

        const bestClients = users.map(user => {
            const paid = user.Client.reduce((sum, contract) => {
                const contractJobsSum = contract.Jobs.reduce((currentSum, job) => currentSum + (job.price || 0), 0);
                return sum + contractJobsSum;
            }, 0);
            return {
                id: user.id,
                fullName: `${user.firstName} ${user.lastName}`,
                paid
            };
        });

        bestClients.sort((a, b) => a.paid > b.paid ? -1 : 1);
        res.json(bestClients.slice(0, limit));
    } catch (e) {
        next(e);
    }
});

// error handling
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).send({ message: err.message });
});

module.exports = app;
