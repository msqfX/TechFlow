import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-stack-queue',
    slug: 'stack-queue',
    title: '栈与队列',
    description:
      '动手操作栈的 LIFO 与队列的 FIFO:压栈弹栈、入队出队,理解调用栈、浏览器历史、任务队列等日常工具背后的数据结构。',
    category: 'algorithm',
    difficulty: 'beginner',
    duration: 12,
    tags: ['栈', '队列', 'LIFO', 'FIFO', '调用栈'],
    prerequisites: [],
    relatedTutorials: ['linked-list', 'bubble-sort', 'jvm-memory-model'],
    sceneType: 'stack-queue',
    featured: false,
    order: 15,
  },
  objectives: [
    '掌握栈的 LIFO:压栈(push)、弹栈(pop)、窥视栈顶(peek)都在同一端',
    '掌握队列的 FIFO:入队(enqueue)在后端、出队(dequeue)在前端',
    '能把日常工具对应到栈或队列:调用栈/撤销/浏览器返回 vs 任务队列/打印队列/BFS',
    '理解操作都是 O(1) 以及溢出/空弹出的边界条件',
  ],
  chapters: [
    {
      id: 'stack',
      title: '栈:后进先出(LIFO)',
      body: `栈就像一摞盘子:只能从**顶端**放(push)和取(pop),最后放上去的最先被拿走 —— **后进先出(LIFO, Last In First Out)**。三个核心操作都发生在栈顶,全部 **O(1)**:

- **push**:压栈(放入栈顶);
- **pop**:弹栈(取出栈顶;空栈弹出是 underflow 错误);
- **peek**:只看栈顶不取出。

栈无处不在:**函数调用栈**(main 调 A、A 调 B,B 最先返回 —— 正是本站 JVM 教程里的栈帧堆叠)、**编辑器撤销**(Ctrl+Z 撤销最近一次操作)、**浏览器返回键**、括号匹配、深度优先搜索(DFS)。`,
    },
    {
      id: 'queue',
      title: '队列:先进先出(FIFO)',
      body: `队列像排队买票:新来的排在**队尾(enqueue)**,服务从**队头(dequeue)**开始 —— **先进先出(FIFO, First In First Out)**。两个操作分别发生在两端,同样全部 O(1)。

队列的日常映射:**操作系统任务队列**(先来先服务)、**打印队列**、**消息队列**(RocketMQ/Kafka 名字里的队列)、广度优先搜索(BFS)、以及 JS 的事件循环 —— 宏任务队列就是典型的 FIFO。

实现细节:用数组做队列时,「出队删第一个元素」会让整个数组移位(O(n));工程实现用**循环数组或链表**让两端操作都保持 O(1) —— 这是「选对实现」的第一个案例。`,
    },
    {
      id: 'together',
      title: '栈与队列的组合拳',
      body: `两个结构组合能解决不少经典问题:

- **两个栈模拟一个队列**:一个栈负责入队,出队时把元素倒到另一个栈再弹(均摊 O(1));
- **用栈匹配括号**:\`{[()]}\` 左括号压栈,右括号与栈顶配对弹出,最后栈空即合法;
- **DFS 用栈 / BFS 用队列**:遍历顺序的差异完全来自容器选择。

边界条件是面试高频:**栈满(溢出)/ 栈空(空弹)**、**队满(循环队列的满队判定)/ 队空**。本教程的实验面板可以亲手触发空弹。`,
    },
  ],
}

export default tutorial
