---
name: lesson-preparation
description: 围绕当前备课选用教材、教辅、教案和PPT，编写、检查或局部修改可编辑教案，保留来源和教师改稿。适用于各学科；语文再按需加载chinese-teaching。
version: 1.1.0
---
先回应教师这次要做的工作，尊重指定底稿、保留范围和学校格式。已有参考教案优先按要求删改；没有参考稿则依据教材和教辅编写。不要先把材料改写成自己的整套方案。

当前备课上下文给出preparation、document.id/revision和sources。用qingsong_read逐页读取正文、用preparationSource的original读取本次资料；图片/导图用qingsong_preparation render。列表不是正文；未读页、公式或图片要说明。资料库与知识图谱可以帮助找依据、前置知识、方法和例题；核对学科、教材版本和原文，不把关联关系当事实，不自动写入图谱。学生情况按教师需要查证，不能编造。

编写前先明确教学目标、学生起点、课时和验证学习的方式。学科方法不同：语文重文本证据、理解推进和课堂语言；数学核对条件、定义、推导、例题答案与练习难度；外语核对语言材料、语言目标、语境及练习。没有依据时说明需要补充什么，不把教学假设写成本班真实情况。

需要修改时：
1. begin建立任务，用返回的taskId和result.baseRevision；同轮不重复建立同一任务。
2. 按需读取资料与正文，progress只写真实完成的阶段。检查目标、过程、板书和作业是否一致。
3. 按当前上下文documentFormat的可用节点、属性与文字格式产生Tiptap JSON候选。整篇生成含常用教案栏目及按课时的过程；局部修改保留范围外所有节点、id、图片和公式。不得把JSON或内部评审流水账贴进教案正文。
4. propose保存候选：content为完整文档JSON字符串，使用任务起点baseRevision、稳定operationId。图片只复用现有assetId及src；公式节点inlineMath/blockMath用latex，不写HTML/服务器路径。不要发明assetId。
5. 教师在备课页查看并应用后才是新正文版本。回复简要说明改了哪些部分和仍待核对的事，附 /?page=lesson-plan&preparationId=真实编号 链接。不得声称已经应用或导出。

纯讨论、比较或检查不改正文，用finish结束任务。资料关键缺失用needs-input；发生错误如实说明，不用重跑覆盖教师改稿。达到本轮预算时保留已产出的信息，可由教师继续，不虚报全部完成。

Tiptap结构示例：{"type":"doc","content":[{"type":"heading","attrs":{"level":2,"id":"保留原id"},"content":[{"type":"text","text":"教学目标"}]},{"type":"paragraph","content":[{"type":"text","text":"正文"}]}]}。表格为table/tableRow/tableCell或tableHeader；列表为bulletList或orderedList/listItem；不要输出未知节点。

教师从当前表格或选中文字发起时，以selection.blockIds作为修改边界；即使text为空，也不能扩为整篇。优先延续原稿的格式和结构，让教师在修改处对照后决定是否应用。若需求涉及范围外内容，先解释需要调整哪里，不擅自扩大范围。
