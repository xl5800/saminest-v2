import "@testing-library/jest-dom/vitest";

/**
 * jsdom 本身不实现 IntersectionObserver，用于无限滚动的 PostList（哨兵元素
 * 进入视口时触发 fetchNextPage）在测试环境里会直接报 ReferenceError。这里
 * 手写一个最小可控的 mock 类，不引入额外的 npm 包：
 * - 构造时把外部传入的 callback 存到实例上，并把自己登记进
 *   `MockIntersectionObserver.instances`；
 * - observe/unobserve/disconnect 只是占位方法，测试不需要真的验证浏览器
 *   有没有开始观察某个元素；
 * - 测试文件里通过 `triggerLastIntersectionObserver(isIntersecting)` 手动
 *   模拟"哨兵进入/离开视口"，不依赖真实的滚动/布局。
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  private readonly callback: IntersectionObserverCallback;
  private connected = true;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(): void {
    this.connected = true;
  }

  unobserve(): void {}

  disconnect(): void {
    this.connected = false;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting: boolean): void {
    if (!this.connected) {
      return;
    }
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

/**
 * 触发最近一次构造出来的 IntersectionObserver 实例的 callback，模拟"哨兵
 * 进入（或离开）视口"。组件里每次渲染只会为当前可见的哨兵元素创建一个
 * 实例，取最后一个就是当前测试关心的那个。
 */
export function triggerLastIntersectionObserver(isIntersecting: boolean): void {
  const instance = MockIntersectionObserver.instances.at(-1);
  if (!instance) {
    throw new Error(
      "No IntersectionObserver instance has been created yet — did the component render its sentinel element?"
    );
  }
  instance.trigger(isIntersecting);
}

/**
 * 每个测试用例之间清空已构造实例列表，避免上一个测试留下的哨兵实例被
 * 误认成"最近一次"，导致 triggerLastIntersectionObserver 打到错误的组件。
 */
export function resetIntersectionObserverMock(): void {
  MockIntersectionObserver.instances = [];
}
