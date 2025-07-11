import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// const model = 'openai/gpt-4o';
// const openai = new OpenAI({
//   baseURL: 'https://openrouter.ai/api/v1',
//   apiKey:
//     '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',
// });

const model = 'claude-3-7-sonnet';
const openai = new OpenAI({
  baseURL:
    'http://openapi-cloud-pub.zhonganinfo.com/devpilot/v1/external/cline',
  apiKey: '5PS2XbCzvaXIw7-24tLvLbxTjnTOtLlH70QuAQGMFaA',
});

// 定义工具函数：获取天气信息
function getWeatherInfo(location: string, unit: string = 'celsius') {
  // 模拟天气数据
  const weatherData = {
    location: location,
    temperature: unit === 'celsius' ? '22°C' : '72°F',
    condition: '晴朗',
    humidity: '65%',
    windSpeed: '10 km/h',
  };

  return JSON.stringify(weatherData);
}

// 定义工具函数：计算器
function calculate(expression: string) {
  try {
    // 简单的数学表达式计算（实际应用中需要更安全的实现）
    const result = eval(expression);
    return `计算结果: ${expression} = ${result}`;
  } catch (error) {
    return `计算错误: ${error}`;
  }
}

// 定义工具函数：获取当前时间
function getCurrentTime(timezone: string = 'Asia/Shanghai') {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  };

  return now.toLocaleString('zh-CN', options);
}

// 工具函数映射
const toolFunctions = {
  getWeatherInfo,
  calculate,
  getCurrentTime,
};

async function testFunctionCall() {
  console.log('🚀 开始测试 Function Call 功能...\n');

  // 定义可用的工具
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function' as const,
      function: {
        name: 'getWeatherInfo',
        description: '获取指定位置的天气信息',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: '城市或地区名称，例如：北京、上海',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: '温度单位，默认为摄氏度',
            },
          },
          required: ['location'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'calculate',
        description: '执行数学计算',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '要计算的数学表达式，例如：2+3*4',
            },
          },
          required: ['expression'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'getCurrentTime',
        description: '获取当前时间',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: '时区，例如：Asia/Shanghai, America/New_York',
            },
          },
        },
      },
    },
  ];

  // 初始消息
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        '你是一个智能助手，可以调用工具函数来帮助用户获取信息。当用户需要天气、计算或时间信息时，请使用相应的工具函数。',
    },
    {
      role: 'user',
      content:
        '你好！请帮我查看北京的天气，并计算一下 15 * 8 + 23，还有现在是几点？',
    },
  ];

  try {
    // 第一次调用 - 获取AI的响应和工具调用请求
    console.log('📤 发送请求到 AI...');
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0].message;
    console.log('📥 AI 响应:', JSON.stringify(responseMessage, null, 2));

    if (responseMessage.tool_calls) {
      console.log('\n🔧 AI 请求调用工具函数:');

      // 添加助手的响应到消息历史
      messages.push(responseMessage);

      // 处理每个工具调用
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n  🛠️  调用函数: ${functionName}`);
        console.log(`  📋 参数:`, functionArgs);

        // 执行工具函数
        let functionResult: string;
        if (functionName in toolFunctions) {
          const func =
            toolFunctions[functionName as keyof typeof toolFunctions];
          if (functionName === 'getWeatherInfo') {
            functionResult = func(functionArgs.location, functionArgs.unit);
          } else if (functionName === 'calculate') {
            functionResult = func(functionArgs.expression);
          } else if (functionName === 'getCurrentTime') {
            functionResult = func(functionArgs.timezone);
          } else {
            functionResult = `错误：未知的函数 ${functionName}`;
          }
        } else {
          functionResult = `错误：未知的函数 ${functionName}`;
        }

        console.log(`  ✅ 执行结果:`, functionResult);

        // 添加工具调用结果到消息历史
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: functionResult,
        });
      }

      // 第二次调用 - 让AI处理工具调用的结果
      console.log('\n📤 发送工具调用结果到 AI...');
      const finalCompletion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
      });

      console.log('\n🎯 AI 的第二次回复:');
      console.log(JSON.stringify(finalCompletion, null, 2));
    } else {
      console.log('\n⚠️  AI 没有调用任何工具函数');
    }
  } catch (error) {
    console.error('❌ 测试出错:', error);
  }
}

// 运行测试
async function main() {
  await testFunctionCall();
}

main().catch(console.error);
