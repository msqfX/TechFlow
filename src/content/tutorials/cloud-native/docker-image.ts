import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-docker-image',
    slug: 'docker-image',
    title: 'Docker 镜像原理',
    description:
      '跟随一次 docker build 与 docker pull:指令逐层生成镜像、层内容寻址与复用、UnionFS 堆叠与容器层的诞生 —— 理解镜像为什么小、为什么可迁移。',
    category: 'cloud-native',
    difficulty: 'intermediate',
    duration: 14,
    tags: ['Docker', '镜像', 'Dockerfile', '分层', '内容寻址'],
    prerequisites: ['docker-container'],
    relatedTutorials: ['docker-container', 'service-discovery', 'nginx-working'],
    sceneType: 'docker-image',
    featured: false,
    order: 27,
  },
  objectives: [
    '理解镜像 = 只读层的堆叠,每条 Dockerfile 指令对应一层',
    '掌握内容寻址(sha256):层内容不变则 ID 不变 → 天然复用',
    '理解构建缓存与 pull 复用:基础层全机/全网共享',
    '理解容器层与镜像的关系:run 时叠加可写层,commit/重建的取舍',
  ],
  chapters: [
    {
      id: 'layers',
      title: 'Dockerfile 指令 → 镜像层',
      body: `每条会**改变文件系统**的 Dockerfile 指令(FROM/RUN/COPY/ADD)生成**一层**:

    FROM debian:slim        ← 层 1(基础)
    RUN apt-get update ...  ← 层 2(安装依赖)
    COPY app.jar /app/      ← 层 3(应用)
    CMD ["java", "-jar", ...]  ← 元数据,不生成层

层是**只读**的,堆叠起来构成镜像。注意两条经典规则:① 层是** additive**——后层删不掉前层的文件(删除只是标记遮蔽,镜像不减重);② RUN 会把中间产物也固化进层 —— 多条 RUN 合并成一条(&& 链)是瘦身的标准手法。`,
    },
    {
      id: 'content-addressed',
      title: '内容寻址:层 ID = sha256(内容)',
      body: `每一层的 ID 不是随机数,而是**层内容的 sha256 哈希**。这带来三个惊人性质:

- **天然去重**:内容相同 = ID 相同。两台机器、两个镜像只要有相同的基础层,磁盘/传输都只存一份;
- **不可篡改**:改一个字节哈希就变 —— 镜像完整性天然可验证;
- **构建缓存**:Dockerfile 某一层指令与上下文未变 → 直接复用缓存层,后面的层才重建(所以 Dockerfile 里**变动频繁的指令放后面**,基础依赖放前面)。

docker pull 时若某层本地已有,输出显示「Already exists」—— 全网节点共享同一份基础层,这就是「镜像为什么小」。`,
    },
    {
      id: 'run',
      title: 'run 时:可写层与镜像的诞生',
      body: `\`docker run\` 时,在镜像顶部挂一个**可写层**(空)—— 容器内的一切写入都落在这里(写时复制)。两个容器共享同一镜像的所有只读层,但可写层互相隔离。

镜像与容器的转换:\`docker commit\` 可把容器可写层固化为新镜像(应急有用),但工程上应始终用 **Dockerfile 重建** —— 可重复、可审计、可回溯;\`docker save/load\` 打包迁移,\`docker push/pull\` 推送注册表(Registry,与代码的 Git 同构)。`,
    },
    {
      id: 'best',
      title: '镜像瘦身清单',
      body: `- **多阶段构建**:构建阶段(编译器/依赖)与运行阶段分离,最终镜像只拷贝产物 —— Java 场景 1GB → 200MB 常见;
- **小基础镜像**:alpine / distroless / slim 变体;
- **合并 RUN && 删除缓存**(rm -rf /var/lib/apt/lists/*);
- **变动层放后**:依赖层在前(稳定,吃缓存),源码 COPY 在最后(频繁变,只重建薄薄几层);
- **.dockerignore**:排除 node_modules/.git,避免上下文臃肿。

本站部署用的 Dockerfile 正是多阶段构建:node:22-alpine 构建阶段产出 dist,nginx:alpine 运行阶段只带走静态文件。`,
    },
  ],
}

export default tutorial
