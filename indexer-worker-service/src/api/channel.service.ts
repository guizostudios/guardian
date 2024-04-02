import { Controller, Module, Inject } from '@nestjs/common';
import { Client, ClientProxy, EventPattern, MessagePattern, Transport, } from '@nestjs/microservices';
import process from 'process';
import { TopicService } from '../services/topic-service.js';
import { MessageService } from '../services/message-service.js';
import { IndexerMessageAPI, MessageResponse, MessageError, Singleton, Jobs, Utils } from '@indexer/common';

interface IOptions {
    NAME: string;
    CYCLE_TIME: number;
    TOPIC_READ_DELAY: number;
    TOPIC_READ_TIMEOUT: number;
    TOPIC_JOB_REFRESH_TIME: number;
    TOPIC_JOB_COUNT: number;
    MESSAGE_READ_DELAY: number;
    MESSAGE_READ_TIMEOUT: number;
    MESSAGE_JOB_REFRESH_TIME: number;
    MESSAGE_JOB_COUNT: number;
}

@Controller()
export class ChannelService {
    private readonly STATUS_DELAY: number = 1000;
    private readonly worker: Worker;

    constructor(@Inject('INDEXER_WORKERS_API') private readonly client: ClientProxy) {
        this.worker = new Worker();
        setInterval(() => {
            const status = this.worker.getStatuses();
            status.delay = this.STATUS_DELAY;
            this.client.emit(IndexerMessageAPI.INDEXER_WORKER_STATUS, status);
        }, this.STATUS_DELAY);
    }

    /**
     * Get all notifications
     * @param msg options
     * @returns Notifications and count
     */
    @EventPattern(IndexerMessageAPI.GET_INDEXER_WORKER_STATUS)
    async updateStatuses() {
        const status = this.worker.getStatuses();
        status.delay = this.STATUS_DELAY;
        this.client.emit(IndexerMessageAPI.INDEXER_WORKER_STATUS, status);
    }
}

/**
 * Worker API
 */
@Singleton
export class Worker {
    public id: string;
    public name: string;
    public status: 'INITIALIZING' | 'STARTED' | 'STOPPED';
    public topics: Jobs;
    public messages: Jobs;

    /**
     * Initialize worker
     */
    public init(option: IOptions): Worker {
        this.id = Utils.GenerateUUIDv4();
        this.name = option.NAME;
        this.status = 'INITIALIZING';
        TopicService.CYCLE_TIME = option.CYCLE_TIME;
        MessageService.CYCLE_TIME = option.CYCLE_TIME;
        this.topics = new Jobs({
            delay: option.TOPIC_READ_DELAY,
            timeout: option.TOPIC_READ_TIMEOUT,
            refresh: option.TOPIC_JOB_REFRESH_TIME,
            count: option.TOPIC_JOB_COUNT,
            callback: TopicService.updateTopic
        });
        this.messages = new Jobs({
            delay: option.MESSAGE_READ_DELAY,
            timeout: option.MESSAGE_READ_TIMEOUT,
            refresh: option.MESSAGE_JOB_REFRESH_TIME,
            count: option.MESSAGE_JOB_COUNT,
            callback: MessageService.updateMessage
        });
        return this;
    }

    /**
     * Start jobs
     */
    public async start(): Promise<Worker> {
        await TopicService.addTopic("0.0.1960");
        await this.topics.start();
        await this.messages.start();
        this.status = 'STARTED';
        return this;
    }

    /**
     * Start stop
     */
    public async stop(): Promise<Worker> {
        await this.topics.stop();
        await this.messages.stop();
        this.status = 'STOPPED';
        return this;
    }

    /**
     * Get statuses
     */
    public getStatuses(): any {
        return {
            id: this.id,
            name: this.name,
            status: this.status,
            topics: this.topics?.getStatuses(),
            messages: this.messages?.getStatuses()
        };
    }
}

/**
 * Channel module
 */
@Module({
    controllers: [ChannelService],
})
export class ChannelModule { }