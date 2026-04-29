/// <reference types="@dcloudio/types" />

/**
 * uni-app 类型声明补充
 */

// 扩展 UniApp 的命名空间
declare namespace UniApp {
  interface RequestSuccessCallbackResult {
    data: any;
    statusCode: number;
    header: Record<string, any>;
    cookies: string[];
    errMsg: string;
  }

  interface GeneralCallbackResult {
    errMsg: string;
  }
}

// 全局 uni 对象
declare const uni: UniApp.Uni;
