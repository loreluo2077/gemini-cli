/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: unknown[];
}

/**
 * 日志工具类，提供与 console 相同的接口，支持文件保存和日志级别控制
 */
export class StudyLogger {
  private static instance: StudyLogger;
  private currentLevel: LogLevel;
  private logFilePath: string = '';
  private writePromise: Promise<void> = Promise.resolve();
  private initPromise: Promise<void>;

  private constructor() {
    // 从环境变量读取日志级别，默认为 INFO
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.currentLevel = this.parseLogLevel(envLevel) ?? LogLevel.INFO;

    // 异步初始化日志路径
    this.initPromise = this.initializeLogPath();
  }

  /**
   * 获取 Logger 单例实例
   */
  public static getInstance(): StudyLogger {
    if (!StudyLogger.instance) {
      StudyLogger.instance = new StudyLogger();
    }
    return StudyLogger.instance;
  }

  /**
   * 异步初始化日志路径
   */
  private async initializeLogPath(): Promise<void> {
    try {
      // 设置日志文件路径到项目的 .gemini 文件夹
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .split('T')[0];
      const projectRoot = await this.findProjectRoot();
      const logDir = path.join(projectRoot, '.gemini');
      this.logFilePath = path.join(logDir, `gemini-cli-${timestamp}.log`);

      // 确保日志目录存在
      await this.ensureLogDirectory();
    } catch (error) {
      // 如果初始化失败，回退到临时目录
      console.warn(
        'Failed to initialize log path, falling back to temp dir:',
        error,
      );
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .split('T')[0];
      this.logFilePath = path.join(os.tmpdir(), `gemini-cli-${timestamp}.log`);
    }
  }

  /**
   * 解析日志级别字符串
   */
  private parseLogLevel(level?: string): LogLevel | null {
    if (!level) return null;
    switch (level) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return null;
    }
  }

  /**
   * 查找项目根目录
   */
  private async findProjectRoot(): Promise<string> {
    let currentDir = process.cwd();

    // 向上查找包含 package.json 的目录
    while (currentDir !== path.dirname(currentDir)) {
      try {
        const packageJsonPath = path.join(currentDir, 'package.json');
        await fs.access(packageJsonPath);
        return currentDir;
      } catch {
        // 继续向上查找
        currentDir = path.dirname(currentDir);
      }
    }

    // 如果找不到，使用当前工作目录
    return process.cwd();
  }

  /**
   * 确保日志目录存在
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFilePath);
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      // 如果创建目录失败，抛出错误让上层处理
      throw new Error(`Failed to create log directory: ${error}`);
    }
  }

  /**
   * 检查是否应该记录指定级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(...args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  }

  /**
   * 写入日志到文件
   */
  private async writeToFile(entry: LogEntry): Promise<void> {
    // 确保初始化完成
    await this.initPromise;

    // 链式处理写入，确保文件写入的顺序性
    this.writePromise = this.writePromise.then(async () => {
      try {
        const logLine = `[${entry.timestamp}] ${entry.level}: ${entry.message}\n`;
        await fs.appendFile(this.logFilePath, logLine);
      } catch (error) {
        // 如果写入文件失败，至少要在控制台输出
        // console.error('Failed to write to log file:', error);
        // console.error('Original log entry:', entry);
      }
    });
  }

  /**
   * 通用日志方法
   */
  private logInternal(
    level: LogLevel,
    levelName: string,
    consoleMethod: (...args: unknown[]) => void,
    ...args: unknown[]
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    // 输出到控制台
    // consoleMethod(...args);

    // 写入到文件
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      message: this.formatMessage(...args),
      data: args.length > 0 ? args : undefined,
    };

    this.writeToFile(entry).catch(() => {
      // 错误已在 writeToFile 中处理
    });
  }

  /**
   * DEBUG 级别日志
   */
  public debug(...args: unknown[]): void {
    this.logInternal(LogLevel.DEBUG, 'DEBUG', console.debug, ...args);
  }

  /**
   * INFO 级别日志
   */
  public info(...args: unknown[]): void {
    this.logInternal(LogLevel.INFO, 'INFO', console.info, ...args);
  }

  /**
   * WARN 级别日志
   */
  public warn(...args: unknown[]): void {
    this.logInternal(LogLevel.WARN, 'WARN', console.warn, ...args);
  }

  /**
   * ERROR 级别日志
   */
  public error(...args: unknown[]): void {
    this.logInternal(LogLevel.ERROR, 'ERROR', console.error, ...args);
  }

  /**
   * 等同于 info，保持与 console 接口一致
   */
  public log(...args: unknown[]): void {
    this.info(...args);
  }

  /**
   * 获取当前日志级别
   */
  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * 获取日志文件路径
   */
  public getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 等待所有日志写入完成
   */
  public async flush(): Promise<void> {
    await this.initPromise;
    await this.writePromise;
  }
}

// 导出默认实例，方便直接使用
export const studyLogger = StudyLogger.getInstance();
