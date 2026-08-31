import * as mockServices from './mockAdapter';
import { resolveServiceConfig } from './config';
import { realServices } from './realAdapter';

export const serviceConfig = resolveServiceConfig();
const services = serviceConfig.dataSource === 'real' ? realServices : mockServices;

export const { serverService, consoleService, playerService, fileService, pluginService, backupService, scheduleService, globalService } = services;
