/* All dynamic player-facing copy and balance data. No external dependencies. */
window.ScrapData = {
  slots: {head:'头部',left:'左臂',core:'核心',right:'右臂',chassis:'底盘',module:'模块'},
  quality: ['普通','强化','稀有','传奇'],
  colors: ['#a4b49a','#72bde1','#c69bea','#f6c45f'],
  parts: {
    saw:{name:'电锯',slots:['left','right'],heat:15,kind:'saw',damage:19,rate:.38,range:118,desc:'环绕切割近敌。装配履带后，移动中伤害 +50%。'},
    flame:{name:'喷火器',slots:['left','right'],heat:22,kind:'flame',damage:8,rate:.16,range:170,desc:'近距离扇形火焰，附加持续灼烧。'},
    laser:{name:'激光头',slots:['head'],heat:20,kind:'laser',damage:24,rate:.75,range:470,desc:'自动锁定并穿透一条直线上的敌人。'},
    tracks:{name:'履带底盘',slots:['chassis'],heat:8,kind:'tracks',desc:'移速 +25%，冲刺冷却减少。与电锯联动。'},
    shield:{name:'护盾核心',slots:['core'],heat:10,kind:'shield',desc:'受到的伤害 -30%，最大生命 +25。'},
    magnet:{name:'磁吸模块',slots:['module','core'],heat:18,kind:'magnet',desc:'扩大拾取范围，周期性吸引附近敌人。'},
    drone:{name:'无人机仓',slots:['left','right','core'],heat:23,kind:'drone',damage:12,rate:.6,range:470,desc:'释放 3 架追踪无人机。电池增加无人机数量。'},
    repair:{name:'自动维修',slots:['module','core'],heat:8,kind:'repair',desc:'每秒回复 0.7 生命，减缓所有零件磨损。'},
    battery:{name:'散热电池',slots:['module','core'],heat:0,kind:'battery',desc:'散热能力 +45。无人机仓额外释放 2 架无人机。'},
    split:{name:'分裂模块',slots:['module'],heat:16,kind:'split',desc:'火箭额外发射两枚侧弹，可融合散射激光。'},
    electric:{name:'电击芯片',slots:['module','head'],heat:18,kind:'electric',damage:14,rate:1.1,range:220,desc:'周期性电击附近敌人，最多连锁 3 个目标。'},
    explosive:{name:'爆炸芯片',slots:['module','core'],heat:24,kind:'explosive',desc:'每第 3 次击杀触发一次范围爆炸。'},
    berserk:{name:'狂暴核心',slots:['core'],heat:28,kind:'berserk',desc:'所有攻击伤害 +35%，热负载增加。'},
    vampire:{name:'吸血芯片',slots:['module'],heat:12,kind:'vampire',desc:'击杀回复 0.8 生命，近战也能持续生存。'},
    rocket:{name:'火箭臂',slots:['left','right'],heat:30,kind:'rocket',damage:40,rate:1.25,range:490,desc:'发射火箭，命中后造成范围爆炸。'},
    fireSaw:{name:'火焰电锯',slots:['left','right'],heat:38,kind:'saw',damage:32,rate:.32,range:135,burn:true,desc:'旋转切割并灼烧，继承履带加成。'},
    scatter:{name:'散射激光',slots:['head'],heat:42,kind:'laser',damage:25,rate:.65,range:490,split:true,desc:'同时发射三束穿透激光。'},
    magRocket:{name:'磁吸火箭',slots:['left','right'],heat:48,kind:'rocket',damage:60,rate:1.15,range:500,magnetic:true,desc:'引爆前将敌人聚拢，爆炸范围大幅扩大。'},
    stormDrone:{name:'雷电无人机',slots:['left','right','core'],heat:42,kind:'drone',damage:19,rate:.55,range:480,electric:true,desc:'每架无人机独立电击，最多连锁 3 个目标；电池增加总输出。'},
    thorn:{name:'反伤护盾',slots:['core'],heat:32,kind:'shield',thorns:true,desc:'减伤 40%，最大生命 +40，接触时反伤。'},
    magFlame:{name:'磁暴喷火器',slots:['left','right'],heat:48,kind:'flame',damage:13,rate:.14,range:205,magnetic:true,desc:'将敌人吸入火焰，持续焚烧。'},
    inferno:{name:'炼狱反应堆',slots:['core'],heat:70,kind:'inferno',damage:22,rate:.8,range:230,desc:'隐藏神器：焚烧周围敌人，敌人死亡引发连锁爆炸。'}
  },
  recipes: [['saw','flame','fireSaw'],['laser','split','scatter'],['magnet','rocket','magRocket'],['drone','electric','stormDrone'],['shield','saw','thorn'],['flame','magnet','magFlame'],['magFlame','explosive','inferno']],
  enemies: [
    {name:'废料虫',hp:22,speed:72,r:13,color:'#c18358',damage:7,from:1},
    {name:'磁暴无人机',hp:24,speed:57,r:15,color:'#91aaa0',damage:8,from:2},
    {name:'拾荒机器人',hp:54,speed:62,r:19,color:'#c89064',damage:11,from:3},
    {name:'巨型压缩机',hp:155,speed:32,r:30,color:'#a06c49',damage:17,from:4},
    {name:'冲锋机械兽',hp:58,speed:84,r:20,color:'#d87359',damage:13,from:5},
    {name:'分裂寄生机',hp:62,speed:61,r:20,color:'#a3aa70',damage:11,from:6},
    {name:'布雷爬行机',hp:48,speed:54,r:17,color:'#d3a75e',damage:10,from:7},
    {name:'维修哨兵',hp:100,speed:40,r:23,color:'#83c3af',damage:12,from:8}
  ],
  text: {
    empty:'未安装',broken:'已损坏',ready:'冲刺就绪',dashWait:'冲刺冷却',stable:'散热正常，所有系统在线。',hot:'超出散热能力！过热满格将预警后故障。',warning:'过热警告：即将失控，准备冲刺撤离！',fault:'过载爆发！机体受损，短暂失去动力。',noSynergy:'等待新零件接入。',synergySaw:'电锯 × 履带：移动切割 +50%',synergyDrone:'无人机 × 电池：额外 2 架无人机',synergyMag:'磁吸 × 爆炸：聚怪后范围引爆',synergyVamp:'近战 × 吸血：击杀修复机体',
    installTo:'装到',heatPreview:'装配后热负载',replace:'替换',forgeWait:'等待两件零件接入…',noRecipe:'这两件零件暂无配方。材料不会被消耗。',maxQuality:'已达传奇品质，无法继续同类升级。',qualityMismatch:'同类升级需要相同品质。',noScrap:'废铁不足，回收或出售零件后再试。',needReward:'请先领取本波的三选一奖励。',needSelect:'先选择一件仓库零件。',wrongSlot:'该零件无法接入这个接口。请查看卡片上的适配接口。',installed:'零件已接入，下一波立即生效。',emptyInventory:'仓库已清空。拆下已安装的零件，或等待下一波回收。',rewardDone:'本波奖励已领取。调整机体后即可出发。',selectHelp:'点击仓库零件，或机体上已安装的零件进行管理。',forgeHint:'选择零件后点击',fuse:'融合 / 12 废铁',repair:'修理所选',sell:'出售所选',remove:'拆下所选零件',got:'已回收',fused:'融合成功',repaired:'零件已修复',sold:'零件已出售',removed:'零件已移入仓库',
    wave:'波次',combat:'回收进行中',workshop:'安全改装区',bossPhase:'摧毁压缩机之王',boss:'压缩机之王',bossIncoming:'最后一波：压缩机之王已启动！',waveClear:'波次完成 · 残留废料已自动回收',winTag:'MISSION COMPLETE',loseTag:'SIGNAL LOST',winTitle:'废铁，也能成为传奇。',loseTitle:'回收协议终止。',winCopy:'压缩机之王已被拆解。你和这台拼出来的机器活到了最后。',loseCopy:'这台机体没能撑住。换一种组合，再来一次。',kill:'击毁',heat:'热量',durability:'耐久',scrap:'废铁',health:'生命',next:'进入下一波 →',pause:'暂停',resume:'继续',soundOn:'音效 开',soundOff:'音效 关',shakeOn:'震屏 开',shakeOff:'震屏 关',
    pickups:['废铁','芯片','电池','核心零件'],picked:'回收',fullHeal:'机体恢复',attackFallback:'应急脉冲在线',forgeResult:'融合结果',wear:'零件磨损已结算',newEnemy:'新威胁',summary:'清理完成，机体修复 30 点，废铁奖励',repairHull:'修复机体 / 15 废铁',hullFull:'机体状态完好。',hullFixed:'机体已恢复 40 生命。',safe:'安全区',upgrade:'品质升级'
  }
};

