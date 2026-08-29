package cn.lycool.app.utils;

/**
 * 系统栏适配的跨类共享状态。
 *
 * statusbarReserve：竖屏下若窗口内容被系统/ROM 强制延伸到状态栏下面
 * （decorFitsSystemWindows(true) 在部分 ROM 上不生效），JS 侧需要额外
 * 预留的状态栏高度（px）。0 表示窗口已正确收缩到状态栏下方，无需预留。
 * 由 MainActivity 测量写入，SizeView（JS）读取。
 *
 * navbarReserve：同理，内容底部被导航栏（手势条）遮挡时需要预留的高度（px）。
 */
public class SystemUiHolder {
  public static volatile int statusbarReserve = 0;
  public static volatile int navbarReserve = 0;
}
