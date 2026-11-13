import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-hash-table',
    slug: 'hash-table',
    title: '哈希表',
    description:
      '跟随一个键的旅程理解哈希表:哈希函数定位桶、链地址法解决冲突、负载因子触发 rehash,以及「平均 O(1)」的边界在哪里。',
    category: 'algorithm',
    difficulty: 'intermediate',
    duration: 15,
    tags: ['哈希表', '哈希函数', '冲突', '链地址法', 'rehash'],
    prerequisites: ['array', 'stack-queue'],
    relatedTutorials: ['linked-list', 'array', 'jvm-memory-model'],
    sceneType: 'hash-table',
    featured: true,
    order: 20,
  },
  objectives: [
    '理解哈希函数的作用:把任意键映射成桶下标,实现 O(1) 定位',
    '掌握冲突的必然性与链地址法(同桶挂链)的处理方式',
    '理解负载因子与 rehash:超阈值扩桶、全部键重新分配',
    '能说清「平均 O(1)、最坏 O(n)」的边界与工程对策',
  ],
  chapters: [
    {
      id: 'hash-func',
      title: '哈希函数:O(1) 定位的魔法',
      body: `数组只能按下标(整数)访问,而我们要存的是 "name" → "Alice" 这样的**键值对**。哈希表的解法:用**哈希函数**把键转成整数,再对桶数取模,得到桶下标:

\`bucket = hash(key) % bucketCount\`

只要哈希函数计算足够快(字符串哈希是 O(键长),通常键很短),定位一个键就是**一步算出位置** —— 不用像数组那样按值扫描 O(n),也不用像链表那样顺指针走。Redis 的 dict、JS 的对象/Map、Python 的 dict,核心都是这个结构。`,
    },
    {
      id: 'collision',
      title: '冲突:不可避免的相遇',
      body: `键的空间远大于桶数(字符串无限,桶只有几个),**不同键必然可能落进同一个桶** —— 这叫**哈希冲突**(鸽巢原理:10 只鸽子 9 个笼子,必有一个笼子装两只)。

最常用的解法是**链地址法(separate chaining)**:每个桶挂一条链表,冲突的键依次追加。查找时先定位桶,再沿链逐个比对键值 —— 冲突越多链条越长,查找越慢。

另一条路线是**开放寻址**:冲突就按探查序列找下一个空桶(线性探查/双重哈希),Redis 就用这种方式。两者取舍:链地址删除简单、容忍高负载;开放寻址缓存友好、省指针内存。`,
    },
    {
      id: 'rehash',
      title: '负载因子与 rehash',
      body: `**负载因子 = 键的数量 ÷ 桶数**。它直接决定冲突概率:因子 1.0 意味着平均每桶一个键(链地址下还有约 37% 的桶空着,但长链开始出现)。

工程实现设置阈值(常见 0.75):超过就**扩容 rehash** —— 桶数翻倍,**所有键重新计算哈希、重新分配**。注意:

- rehash 是 **O(n) 的大动作**,但翻倍式扩容让它均摊 O(1)(与动态数组扩容同款分析);
- rehash 期间键的桶位置**全部会变**(模数变了),这就是 Redis rehash 要渐进式进行的原因 —— 一次性搬百万键会卡住服务;
- 已知规模时预设容量,避免 rehash,与动态数组同理。`,
    },
    {
      id: 'worst',
      title: '「平均 O(1)」的边界',
      body: `哈希表的平均 O(1) 有两个前提:**哈希函数分布均匀** + **负载因子受控**。打破任何一个都会退化:

- **最坏情况**:所有键撞进同一个桶 → 退化成链表,操作 O(n)。哈希碰撞攻击(DoS)就是恶意构造同桶键 —— 对策是带密钥的哈希(SipHash)或随机种子;
- **哈希函数质量差**:分布倾斜,某些桶偏长;
- 因此严格说哈希表是「**平均/均摊 O(1),最坏 O(n)**」,配合好的函数与扩容策略,最坏在实践中几乎不出现。

工程组合技:**哈希表 + 双向链表 = LRU 缓存**(哈希 O(1) 定位,链表 O(1) 调整新旧顺序)—— 两个结构的短板恰好互补。`,
    },
  ],
}

export default tutorial
