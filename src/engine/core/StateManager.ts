import type { StepTransition } from '../types/step'

/**
 * 步骤状态管理器。
 * 状态从初始状态开始,经纯函数转移逐步折叠并缓存,
 * 保证 goToStep(任意索引) 可以直接重建场景状态(docs §5.5)。
 */
export class StateManager<S> {
  private states: S[]
  private _index: number

  constructor(
    private readonly initial: S,
    private readonly transitions: StepTransition<S>[],
  ) {
    this.states = [initial]
    this._index = 0
  }

  get current(): S {
    return this.states[this._index] as S
  }

  /** 当前索引 = 已执行完成的步骤数 */
  get index(): number {
    return this._index
  }

  get total(): number {
    // states[0] 是初始状态,对应步骤 0 执行前的画面;
    // 执行完 transitions[i] 后进入 states[i+1]。
    return this.transitions.length
  }

  /** 是否已缓存到第 i 步执行后的状态 */
  hasStateAt(stepIndex: number): boolean {
    return stepIndex >= 0 && stepIndex <= this.states.length - 1
  }

  /** 第 stepIndex 步执行后的状态(states[stepIndex]) */
  stateAt(stepIndex: number): S {
    if (stepIndex < 0 || stepIndex > this.transitions.length) {
      throw new Error(`StateManager: 步骤索引越界 ${stepIndex}`)
    }
    // 按需折叠补齐
    while (this.states.length <= stepIndex) {
      const next = this.states.length
      const transition = this.transitions[next - 1] as StepTransition<S>
      this.states.push(transition(this.states[next - 1] as S, '', next - 1))
    }
    return this.states[stepIndex] as S
  }

  /** 前进到第 stepIndex 步执行后的状态(states[stepIndex]) */
  goToState(stepIndex: number): S {
    this._index = stepIndex
    return this.stateAt(stepIndex)
  }

  /** 追加一个转移(初始化时一次性构建全部步骤) */
  appendTransition(transition: StepTransition<S>): void {
    this.transitions.push(transition)
  }

  reset(): S {
    this._index = 0
    return this.initial
  }
}
