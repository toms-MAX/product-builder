"""
seed_1800.py — 뜯어먹는 영단어 1800 삽입
레벨: 1-360=중2, 361-720=중3, 721-1800=고1
실행: python backend/db/seed_1800.py
"""
import sqlite3, uuid, re, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
from backend.agents.doc_agent import ensure_db, save_word

DB_PATH = ROOT / "backend" / "db" / "qbank.db"

# ── 불규칙 동사표 ──────────────────────────────────────
IRREG = {
    "begin":    ("began","begun","beginning"),
    "believe":  ("believed","believed","believing"),
    "blow":     ("blew","blown","blowing"),
    "break":    ("broke","broken","breaking"),
    "bring":    ("brought","brought","bringing"),
    "build":    ("built","built","building"),
    "burn":     ("burned","burned","burning"),
    "buy":      ("bought","bought","buying"),
    "carry":    ("carried","carried","carrying"),
    "catch":    ("caught","caught","catching"),
    "choose":   ("chose","chosen","choosing"),
    "climb":    ("climbed","climbed","climbing"),
    "come":     ("came","come","coming"),
    "cook":     ("cooked","cooked","cooking"),
    "cut":      ("cut","cut","cutting"),
    "dance":    ("danced","danced","dancing"),
    "decide":   ("decided","decided","deciding"),
    "deliver":  ("delivered","delivered","delivering"),
    "develop":  ("developed","developed","developing"),
    "die":      ("died","died","dying"),
    "dig":      ("dug","dug","digging"),
    "discover": ("discovered","discovered","discovering"),
    "divide":   ("divided","divided","dividing"),
    "do":       ("did","done","doing"),
    "draw":     ("drew","drawn","drawing"),
    "drink":    ("drank","drunk","drinking"),
    "drive":    ("drove","driven","driving"),
    "eat":      ("ate","eaten","eating"),
    "fall":     ("fell","fallen","falling"),
    "feel":     ("felt","felt","feeling"),
    "fight":    ("fought","fought","fighting"),
    "find":     ("found","found","finding"),
    "fly":      ("flew","flown","flying"),
    "forget":   ("forgot","forgotten","forgetting"),
    "forgive":  ("forgave","forgiven","forgiving"),
    "freeze":   ("froze","frozen","freezing"),
    "get":      ("got","gotten","getting"),
    "give":     ("gave","given","giving"),
    "go":       ("went","gone","going"),
    "grow":     ("grew","grown","growing"),
    "hang":     ("hung","hung","hanging"),
    "have":     ("had","had","having"),
    "hear":     ("heard","heard","hearing"),
    "hide":     ("hid","hidden","hiding"),
    "hit":      ("hit","hit","hitting"),
    "hold":     ("held","held","holding"),
    "hurt":     ("hurt","hurt","hurting"),
    "keep":     ("kept","kept","keeping"),
    "know":     ("knew","known","knowing"),
    "lay":      ("laid","laid","laying"),
    "lead":     ("led","led","leading"),
    "learn":    ("learned","learned","learning"),
    "leave":    ("left","left","leaving"),
    "lend":     ("lent","lent","lending"),
    "let":      ("let","let","letting"),
    "lie":      ("lay","lain","lying"),
    "lose":     ("lost","lost","losing"),
    "make":     ("made","made","making"),
    "mean":     ("meant","meant","meaning"),
    "meet":     ("met","met","meeting"),
    "move":     ("moved","moved","moving"),
    "pay":      ("paid","paid","paying"),
    "put":      ("put","put","putting"),
    "read":     ("read","read","reading"),
    "ride":     ("rode","ridden","riding"),
    "rise":     ("rose","risen","rising"),
    "run":      ("ran","run","running"),
    "save":     ("saved","saved","saving"),
    "see":      ("saw","seen","seeing"),
    "sell":     ("sold","sold","selling"),
    "send":     ("sent","sent","sending"),
    "set":      ("set","set","setting"),
    "shake":    ("shook","shaken","shaking"),
    "shine":    ("shone","shone","shining"),
    "shoot":    ("shot","shot","shooting"),
    "show":     ("showed","shown","showing"),
    "sing":     ("sang","sung","singing"),
    "sit":      ("sat","sat","sitting"),
    "sleep":    ("slept","slept","sleeping"),
    "solve":    ("solved","solved","solving"),
    "speak":    ("spoke","spoken","speaking"),
    "spend":    ("spent","spent","spending"),
    "spread":   ("spread","spread","spreading"),
    "stand":    ("stood","stood","standing"),
    "steal":    ("stole","stolen","stealing"),
    "swim":     ("swam","swum","swimming"),
    "take":     ("took","taken","taking"),
    "teach":    ("taught","taught","teaching"),
    "tell":     ("told","told","telling"),
    "think":    ("thought","thought","thinking"),
    "throw":    ("threw","thrown","throwing"),
    "understand":("understood","understood","understanding"),
    "wake":     ("woke","woken","waking"),
    "wear":     ("wore","worn","wearing"),
    "win":      ("won","won","winning"),
    "write":    ("wrote","written","writing"),
}

def verb_forms(w):
    if w in IRREG:
        return IRREG[w]
    # 규칙 변화
    if w.endswith("e"):
        return (w+"d", w+"d", w[:-1]+"ing")
    if len(w)>3 and w[-1] not in "aeiou" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        return (w+w[-1]+"ed", w+w[-1]+"ed", w+w[-1]+"ing")
    if w.endswith("y") and w[-2] not in "aeiou":
        return (w[:-1]+"ied", w[:-1]+"ied", w+"ing")
    return (w+"ed", w+"ed", w+"ing")

VERB_KO  = ("하다","되다","시키다","내다","지다","보다","오다","가다","이다","기다","치다","잡다","열다","닫다")
ADJ_ENDS = ("한,","인,","한","인","적인","스러운","없는","있는","로운","된","운","진","던","친")
ADV_SFXS = ("ly","ward","wards","wise")
ADJ_SFXS = ("ful","ous","ive","al","ic","ish","less","ent","ant","able","ible","ary","ern","ful")
NOUN_SFXS= ("tion","sion","ness","ment","ity","age","ance","ence","ship","hood","dom","ism","ure","ture","th")
ADV_EXCEPT = {"lovely","friendly","early","elderly","silly","ugly","likely","lonely","deadly","lively","holy","jolly","curly","daily","weekly","monthly","yearly","orderly","worldly","timely"}

def detect_pos(word, meaning_ko):
    w = word.lower()
    # 명시적 동사 목록
    if w in IRREG:
        return "verb"
    # 한국어 의미에 동사 어미
    for vk in VERB_KO:
        if vk in meaning_ko:
            return "verb"
    # 영어 부사 어미
    if any(w.endswith(s) for s in ADV_SFXS) and w not in ADV_EXCEPT and len(w)>4:
        return "adverb"
    # 영어 형용사 어미
    if any(w.endswith(s) for s in ADJ_SFXS):
        return "adjective"
    # 한국어 형용사 어미
    clean = re.sub(r'\(.*?\)','',meaning_ko)
    first = clean.split(',')[0].strip()
    if any(first.endswith(e) for e in ADJ_ENDS):
        return "adjective"
    # 영어 명사 어미
    if any(w.endswith(s) for s in NOUN_SFXS):
        return "noun"
    return "noun"

def get_level(num):
    if num <= 360:  return "중2", 2
    if num <= 720:  return "중3", 3
    return "고1", 4

# ── 단어 데이터 (num, word, meaning_ko) ───────────────
WORDS = []

def add(num, word, meaning_ko):
    WORDS.append((num, word.lower().strip(), meaning_ko.strip()))

# 1-90
add(1,"life","삶,인생"); add(2,"job","일,직업"); add(3,"country","나라,시골")
add(4,"earth","지구,땅"); add(5,"problem","문제"); add(6,"way","방법,길")
add(7,"language","언어"); add(8,"dialog","대화"); add(9,"story","이야기,층")
add(10,"lot","다량,많이"); add(11,"name","이름을 붙이다"); add(12,"hand","손,건네주다")
add(13,"place","장소,두다"); add(14,"practice","연습하다"); add(15,"work","일하다")
add(16,"use","사용하다"); add(17,"kind","종류,친절한"); add(18,"have","가지다,먹다")
add(19,"make","만들다"); add(20,"let","허락하다"); add(21,"get","얻다,이르다,되다")
add(22,"take","데려가다,필요로 하다"); add(23,"live","살다,살아있는"); add(24,"different","다른")
add(25,"important","중요한"); add(26,"other","다른,그 밖의"); add(27,"right","옳은,오른쪽의")
add(28,"sure","확신하는,물론"); add(29,"too","너무,~도 또한"); add(30,"well","잘,건강한,우물")
add(31,"person","사람,인물"); add(32,"clothes","옷,의복"); add(33,"movie","영화")
add(34,"activity","활동"); add(35,"example","예,모범"); add(36,"letter","편지,글자")
add(37,"fire","불,화재"); add(38,"minute","분,순간"); add(39,"part","부분,가르다")
add(40,"plan","계획하다"); add(41,"plant","식물,공장"); add(42,"park","공원,주차하다")
add(43,"call","통화하다,부르다"); add(44,"try","시도하다,노력하다"); add(45,"need","필요하다")
add(46,"fun","재미,장난"); add(47,"future","미래"); add(48,"keep","유지하다,지키다")
add(49,"listen","듣다"); add(50,"find","찾아내다,발견하다"); add(51,"learn","배우다,알아내다")
add(52,"mean","의미하다"); add(53,"last","지난,마지막의"); add(54,"any","무슨,약간의")
add(55,"each","각각"); add(56,"another","또 하나의"); add(57,"same","같은")
add(58,"hard","단단한,어려운"); add(59,"also","~도 또한"); add(60,"really","참으로,정말")
add(61,"bird","새"); add(62,"trip","여행"); add(63,"vacation","휴가,방학")
add(64,"course","강좌,과정,진로"); add(65,"space","공간,우주"); add(66,"street","거리,도로")
add(67,"side","측,쪽,측면"); add(68,"paper","종이,서류,신문"); add(69,"newspaper","신문")
add(70,"face","얼굴,직면하다"); add(71,"mind","마음,꺼리다"); add(72,"volunteer","자원봉사자,자원하다")
add(73,"change","변화하다,거스름돈"); add(74,"visit","방문하다"); add(75,"start","시작하다")
add(76,"watch","지켜보다,시계"); add(77,"light","빛,밝은"); add(78,"present","선물,현재,출석한")
add(79,"favorite","가장 좋아하는"); add(80,"enjoy","즐기다"); add(81,"win","이기다,획득하다")
add(82,"understand","이해하다"); add(83,"warm","따뜻한"); add(84,"clean","깨끗한")
add(85,"please","제발,기쁘게 하다"); add(86,"interesting","재미있는"); add(87,"famous","유명한")
add(88,"special","특별한,전문의"); add(89,"only","단지,오직,유일한"); add(90,"just","막,단지")

# 91-180
add(91,"nature","자연,천성"); add(92,"restaurant","레스토랑,식당"); add(93,"group","무리,집단")
add(94,"habit","습관"); add(95,"culture","문화"); add(96,"information","정보")
add(97,"advertisement","광고"); add(98,"science","과학"); add(99,"gene","유전자")
add(100,"war","전쟁"); add(101,"middle","한가운데"); add(102,"store","가게,비축하다")
add(103,"sound","소리,들리다,건전한"); add(104,"point","요점,점수,가리키다"); add(105,"land","땅,육지,착륙하다")
add(106,"clone","복제생물,복제하다"); add(107,"turn","돌다,차례,회전"); add(108,"fly","날다,파리")
add(109,"begin","시작하다"); add(110,"grow","성장하다,기르다,되다"); add(111,"believe","믿다")
add(112,"worry","걱정시키다"); add(113,"save","구하다,저축하다,절약하다"); add(114,"easy","쉬운,편한")
add(115,"poor","가난한,불쌍한"); add(116,"such","그러한"); add(117,"own","자신의,소유하다")
add(118,"fast","빨리,단단히"); add(119,"back","뒤,등"); add(120,"always","늘,언제나")
add(121,"history","역사"); add(122,"state","국가,상태"); add(123,"soldier","군인")
add(124,"village","마을"); add(125,"office","사무실"); add(126,"island","섬")
add(127,"piece","조각"); add(128,"grade","성적,등급,학년"); add(129,"spring","봄,용수철")
add(130,"rock","바위,흔들다"); add(131,"line","선,줄을 서다"); add(132,"cook","요리사,요리하다")
add(133,"fall","떨어지다,가을"); add(134,"exercise","운동,연습하다"); add(135,"end","끝나다")
add(136,"front","앞의"); add(137,"second","제2의,초,잠깐"); add(138,"few","소수의,조금의")
add(139,"both","양쪽,둘다의"); add(140,"happen","일어나다"); add(141,"leave","떠나다,내버려두다")
add(142,"remember","기억하다"); add(143,"wear","입다,착용하다"); add(144,"move","움직이다,감동시키다")
add(145,"send","보내다"); add(146,"true","진짜의,참된"); add(147,"hot","뜨거운,매운")
add(148,"early","초기의,일찍"); add(149,"often","종종,자주"); add(150,"sometimes","때때로")
add(151,"pet","애완동물"); add(152,"vegetable","채소,야채"); add(153,"leaf","잎")
add(154,"forest","숲"); add(155,"area","지역,분야"); add(156,"neighbor","이웃")
add(157,"art","미술,예술"); add(158,"poem","시"); add(159,"subject","과목,주제")
add(160,"bottle","병"); add(161,"machine","기계"); add(162,"fact","사실")
add(163,"rule","규칙,지배하다"); add(164,"break","깨뜨리다,휴식"); add(165,"check","점검하다")
add(166,"stay","머무르다"); add(167,"cold","추운,감기"); add(168,"bring","가져오다")
add(169,"build","짓다,건축하다"); add(170,"join","가입하다"); add(171,"lose","잃다,지다")
add(172,"die","죽다"); add(173,"large","큰,넓은"); add(174,"sick","병든,아픈")
add(175,"busy","바쁜,번화한"); add(176,"real","진짜의,현실의"); add(177,"most","대부분,가장")
add(178,"late","늦은,늦게"); add(179,"together","함께,같이"); add(180,"even","~조차,더욱~")

# 181-270
add(181,"health","건강"); add(182,"holiday","공휴일"); add(183,"gift","선물,타고난 재능")
add(184,"field","들판,경기장,분야"); add(185,"site","장소,현장,웹사이트"); add(186,"goal","목표,골")
add(187,"effect","영향,결과,효과"); add(188,"sign","표지,신호,서명하다"); add(189,"report","보고하다")
add(190,"order","순서,질서,명령하다"); add(191,"experience","경험하다"); add(192,"result","결과")
add(193,"ride","타다,타기"); add(194,"wish","바라다,소원"); add(195,"half","절반의")
add(196,"past","지나간,과거"); add(197,"carry","가지고 가다,나르다"); add(198,"draw","그리다,끌다")
add(199,"spend","시간,돈을 쓰다"); add(200,"wait","기다리다"); add(201,"decide","결정하다")
add(202,"choose","고르다,선택하다"); add(203,"popular","인기있는,대중의"); add(204,"difficult","어려운")
add(205,"foreign","외국의"); add(206,"able","~할 수 있는"); add(207,"full","가득찬")
add(208,"wrong","틀린,잘못된"); add(209,"usually","보통,일반적으로"); add(210,"never","결코~않다")
add(211,"brain","뇌"); add(212,"voice","목소리"); add(213,"opinion","의견,견해")
add(214,"age","나이,시대"); add(215,"century","세기,100년"); add(216,"weekend","주말")
add(217,"price","값,가격"); add(218,"dish","접시,요리"); add(219,"subway","지하철")
add(220,"custom","관습,풍습"); add(221,"rest","휴식하다,나머지"); add(222,"waste","낭비,쓰레기")
add(223,"surprise","놀라게하다,놀람"); add(224,"bear","낳다,곰"); add(225,"fight","싸우다,싸움")
add(226,"hundred","100"); add(227,"thousand","1000"); add(228,"human","인간")
add(229,"buy","사다"); add(230,"sell","팔다"); add(231,"follow","따르다")
add(232,"miss","놓치다,그리워하다"); add(233,"close","닫다,가까운"); add(234,"healthy","건강한")
add(235,"delicious","맛있는"); add(236,"sad","슬픈"); add(237,"careful","주의깊은,조심하는")
add(238,"ready","준비된"); add(239,"away","떨어져,떠나서"); add(240,"however","그러나")
add(241,"diary","일기"); add(242,"cartoon","만화"); add(243,"character","성격,인물,글자")
add(244,"reason","이유,이성"); add(245,"ground","땅,운동장"); add(246,"community","공동체,지역사회")
add(247,"event","사건,행사"); add(248,"glass","유리잔"); add(249,"toy","장난감")
add(250,"weight","무게,몸무게"); add(251,"control","지배,통제하다"); add(252,"step","걸음,단계,계단")
add(253,"matter","문제,물질,중요하다"); add(254,"match","시합,성냥,어울리다"); add(255,"set","두다,놓다,세우다")
add(256,"hold","잡고있다,개최하다"); add(257,"pick","고르다,따다,뽑다"); add(258,"teach","가르치다")
add(259,"agree","동의하다"); add(260,"invent","발명하다"); add(261,"finish","끝내다")
add(262,"welcome","환영하다"); add(263,"bright","빛나는,밝은"); add(264,"smart","영리한")
add(265,"wise","현명한,슬기로운"); add(266,"hungry","배고픈"); add(267,"free","자유로운,무료의")
add(268,"fine","좋은,훌륭한,잘"); add(269,"still","여전히"); add(270,"soon","곧,일찍")

# 271-360
add(271,"teenager","십대소년소녀"); add(272,"president","대통령,장"); add(273,"arm","팔")
add(274,"meal","식사"); add(275,"skill","기술"); add(276,"contest","경쟁")
add(277,"prize","상,상품"); add(278,"chance","기회"); add(279,"shape","모양,건강상태")
add(280,"difference","다름,차이"); add(281,"wall","벽"); add(282,"smell","냄새")
add(283,"interest","관심을 끌다"); add(284,"judge","재판관,판단하다"); add(285,"cause","원인이 되다")
add(286,"cover","덮다,덮개"); add(287,"travel","여행하다"); add(288,"guess","추측하다")
add(289,"catch","잡다"); add(290,"wash","씻다"); add(291,"hurt","다치게하다,상처")
add(292,"introduce","소개하다"); add(293,"upset","속상한,당황한"); add(294,"tired","피곤한,싫증난")
add(295,"proud","자랑스러운"); add(296,"dirty","더러운"); add(297,"dark","어두운,어둠")
add(298,"whole","전체"); add(299,"later","나중에,더 뒤의"); add(300,"once","한번,일단~하면")
add(301,"environment","환경"); add(302,"pollution","오염"); add(303,"lake","호수")
add(304,"desert","사막"); add(305,"insect","곤충"); add(306,"accident","사고")
add(307,"college","대학"); add(308,"exam","시험"); add(309,"advice","조언,충고")
add(310,"hobby","취미"); add(311,"form","모양,형식,형성하다"); add(312,"mark","표시")
add(313,"board","판,탈것에 타다"); add(314,"post","우편,기둥"); add(315,"laugh","웃다,웃음")
add(316,"fat","살찐,지방이많은"); add(317,"excuse","용서하다,변명하다"); add(318,"pass","지나가다,합격하다")
add(319,"drive","운전하다"); add(320,"receive","받다"); add(321,"climb","오르다,등반하다")
add(322,"add","더하다"); add(323,"afraid","두려워하는,걱정하는"); add(324,"dangerous","위험한")
add(325,"physical","신체의,물질의"); add(326,"modern","현대의"); add(327,"pretty","예쁜,매우")
add(328,"off","떨어져"); add(329,"ever","이전에,언제나,언젠가"); add(330,"someday","미래의 언젠가")
add(331,"model","모형,모델,모범"); add(332,"clerk","사무원,점원"); add(333,"foot","발")
add(334,"company","회사,친구,교제"); add(335,"factory","공장"); add(336,"garage","차고")
add(337,"palace","궁전"); add(338,"hole","구멍"); add(339,"bill","청구서,지폐,법안")
add(340,"seed","씨"); add(341,"medicine","약,의학"); add(342,"meaning","의미,뜻")
add(343,"view","견해,전망,바라보다"); add(344,"race","경주하다,인종"); add(345,"act","행동하다,연기하다")
add(346,"pay","지불하다,봉급"); add(347,"shout","외치다,외침"); add(348,"cross","건너다,십자가")
add(349,"seem","~처럼 보이다"); add(350,"invite","초대하다"); add(351,"arrive","도착하다")
add(352,"collect","모으다,수집하다"); add(353,"angry","성난,화난"); add(354,"blind","눈먼")
add(355,"rich","부유한,풍부한"); add(356,"heavy","무거운,심한"); add(357,"useful","유용한,쓸모있는")
add(358,"strange","이상한,낯선"); add(359,"maybe","아마,어쩌면"); add(360,"ago","~전에")

# 361-450
add(361,"sense","느낌,감각,분별력"); add(362,"pleasure","기쁨,즐거움"); add(363,"image","이미지,모습")
add(364,"map","지도"); add(365,"type","유형"); add(366,"project","계획")
add(367,"traffic","교통"); add(368,"safety","안전"); add(369,"spaceship","우주선")
add(370,"rainbow","무지개"); add(371,"block","블록,구획,막다"); add(372,"seat","좌석,앉히다")
add(373,"lie","눕다,거짓말"); add(374,"touch","만지다,접촉"); add(375,"wonder","궁금히 여기다,경이")
add(376,"million","100만"); add(377,"magic","마술"); add(378,"secret","비밀")
add(379,"general","일반적인,장군"); add(380,"prepare","준비하다"); add(381,"imagine","상상하다")
add(382,"forget","잊다"); add(383,"develop","발전하다,개발하다"); add(384,"recycle","재활용하다")
add(385,"funny","웃기는,재미있는"); add(386,"serious","진지한,심각한"); add(387,"several","몇몇의")
add(388,"far","멀리,먼"); add(389,"loud","큰소리의"); add(390,"almost","거의")
add(391,"truth","진실,진리"); add(392,"luck","행운"); add(393,"success","성공")
add(394,"friendship","우정"); add(395,"being","존재,생물"); add(396,"goods","상품,물품")
add(397,"coin","동전"); add(398,"bank","은행,둑"); add(399,"address","주소,연설")
add(400,"electricity","전기"); add(401,"law","법률"); add(402,"campaign","캠페인,운동")
add(403,"heat","열,더위,가열하다"); add(404,"circle","원,집단"); add(405,"mix","섞다,혼합")
add(406,"reach","도착하다,이르다"); add(407,"excite","흥분시키다"); add(408,"rise","오르다")
add(409,"lead","이끌다"); add(410,"enter","들어가다,입학하다"); add(411,"fill","가득채우다")
add(412,"produce","생산하다"); add(413,"cool","시원한,멋진"); add(414,"slow","느린,늦추다")
add(415,"false","거짓의,가짜의"); add(416,"national","국가의,민족의"); add(417,"main","주요한")
add(418,"possible","가능한"); add(419,"enough","충분한"); add(420,"finally","마침내,마지막으로")
add(421,"library","도서관"); add(422,"museum","박물관"); add(423,"ocean","바다,대양")
add(424,"bath","목욕"); add(425,"pity","동정,유감스러운 일"); add(426,"sentence","문장")
add(427,"proverb","격언,속담"); add(428,"product","생산품,제품"); add(429,"invention","발명")
add(430,"technology","과학기술"); add(431,"trash","쓰레기"); add(432,"moment","때,순간")
add(433,"date","날짜,데이트"); add(434,"taste","맛이나다,취향"); add(435,"balance","균형을 잡다")
add(436,"ring","반지,종"); add(437,"share","공유하다,나누다,몫"); add(438,"return","되돌아가다,돌려주다")
add(439,"lift","올리다,태우기"); add(440,"raise","올리다,모금하다,기르다"); add(441,"explain","설명하다")
add(442,"marry","~와 결혼하다"); add(443,"clear","명확한,깨끗이하다"); add(444,"exciting","흥분시키는")
add(445,"common","흔한,공통의,보통의"); add(446,"global","전세계의,지구의"); add(447,"safe","안전한")
add(448,"terrible","끔찍한,지독한"); add(449,"probably","아마"); add(450,"else","그밖에")

# 451-540
add(451,"peace","평화"); add(452,"beauty","아름다움,미인"); add(453,"sight","시력,시야,광경")
add(454,"nation","국가,민족"); add(455,"foreigner","외국인"); add(456,"band","악단,밴드,띠")
add(457,"magazine","잡지"); add(458,"storm","폭풍우"); add(459,"straw","짚,빨대")
add(460,"disease","병"); add(461,"respect","존경하다"); add(462,"reply","대답하다")
add(463,"record","기록하다,녹음하다"); add(464,"cheer","환호하다"); add(465,"shake","흔들다")
add(466,"square","정사각형의,광장"); add(467,"key","열쇠,비결,중요한"); add(468,"wake","잠에서 깨다")
add(469,"discover","발견하다"); add(470,"solve","풀다,해결하다"); add(471,"continue","계속하다")
add(472,"burn","불타다"); add(473,"fresh","새로운,신선한"); add(474,"simple","간단한,단순한")
add(475,"quiet","조용한"); add(476,"regular","규칙적인,보통의"); add(477,"traditional","전통의")
add(478,"international","국제의"); add(479,"instead","대신에"); add(480,"suddenly","갑자기")
add(481,"pal","친구"); add(482,"ghost","유령"); add(483,"bone","뼈")
add(484,"effort","노력"); add(485,"wisdom","지혜"); add(486,"fault","잘못,결점")
add(487,"flight","항공편,비행"); add(488,"zoo","동물원"); add(489,"candle","양초")
add(490,"bottom","밑바닥"); add(491,"mistake","실수하다"); add(492,"trouble","곤란,괴롭히다")
add(493,"bat","박쥐,배트로 치다"); add(494,"blow","불다,강타"); add(495,"flood","홍수,물로 뒤덮다")
add(496,"hurry","서두르다"); add(497,"treat","다루다,치료하다,대접하다"); add(498,"express","표현하다")
add(499,"breathe","숨 쉬다"); add(500,"hate","몹시 싫어하다"); add(501,"create","창조하다")
add(502,"divide","나누다"); add(503,"huge","거대한"); add(504,"perfect","완전한,완벽한")
add(505,"successful","성공한"); add(506,"amazing","놀랄만한"); add(507,"everyday","매일의,일상의")
add(508,"low","낮은,낮게"); add(509,"alone","혼자의,외로이"); add(510,"inside","안쪽에,의")
add(511,"creature","동물,상상의 생명체"); add(512,"fan","팬,선풍기,부채"); add(513,"army","육군,군대")
add(514,"charity","자선단체"); add(515,"department","부문"); add(516,"scene","장면,현장")
add(517,"memory","기억력"); add(518,"recipe","조리법"); add(519,"bar","막대,빗장,술집")
add(520,"wheel","바퀴"); add(521,"kid","아이,농담하다"); add(522,"smoke","연기,담배를 피우다")
add(523,"favor","호의,선호하다"); add(524,"trick","속임수,속이다"); add(525,"experiment","실험하다")
add(526,"drop","떨어뜨리다,방울"); add(527,"press","누르다,강요하다,언론"); add(528,"stick","붙이다,찌르다,막대기")
add(529,"roll","구르다,말다,두루마리"); add(530,"serve","시중들다,봉사하다"); add(531,"improve","개선하다,향상되다")
add(532,"realize","깨닫다,실현하다"); add(533,"dry","마른,건조한,말리다"); add(534,"complete","완전한,완성하다")
add(535,"lucky","행운의,운 좋은"); add(536,"natural","자연의,자연스러운"); add(537,"friendly","친절한,친한")
add(538,"cute","귀여운"); add(539,"already","이미,벌써"); add(540,"especially","특히")

# 541-630
add(541,"hometown","고향"); add(542,"yard","마당,뜰"); add(543,"grocery","식료 잡화류")
add(544,"bridge","다리"); add(545,"fairy","요정"); add(546,"flag","국기,깃발")
add(547,"manner","방법,예절"); add(548,"noise","시끄러운 소리,소음"); add(549,"pain","고통,수고")
add(550,"guide","안내자,안내하다"); add(551,"coach","코치하다"); add(552,"note","노트,음표,주의하다")
add(553,"count","세다,계산하다"); add(554,"promise","약속하다"); add(555,"sail","항해하다,돛")
add(556,"principal","교장,주요한"); add(557,"bake","굽다"); add(558,"gather","모으다,모이다")
add(559,"succeed","성공하다"); add(560,"protect","보호하다"); add(561,"advertise","광고하다")
add(562,"disappear","사라지다"); add(563,"electric","전기의"); add(564,"lovely","아름다운,즐거운")
add(565,"soft","부드러운"); add(566,"empty","빈"); add(567,"round","둥근,왕복의,라운드")
add(568,"deep","깊은,깊게"); add(569,"yet","아직,이미,그렇지만"); add(570,"quickly","빨리,곧")
add(571,"couple","쌍,부부"); add(572,"honey","벌꿀,여보"); add(573,"tourist","관광객")
add(574,"society","사회"); add(575,"background","배경"); add(576,"capital","수도,대문자,자본")
add(577,"valley","골짜기,계곡"); add(578,"direction","방향,지시"); add(579,"distance","거리")
add(580,"behavior","행동"); add(581,"danger","위험"); add(582,"object","물건,목적,대상")
add(583,"tear","눈물,찢어지다"); add(584,"honor","명예,존경하다"); add(585,"increase","늘리다,증가하다")
add(586,"bite","물다,물기"); add(587,"male","남성의,수컷의"); add(588,"native","출생지의,원주민")
add(589,"disappoint","실망시키다"); add(590,"shine","빛나다"); add(591,"fix","고치다,고정시키다")
add(592,"pour","따르다,붓다"); add(593,"allow","허용하다"); add(594,"prevent","막다,못하게 하다")
add(595,"certain","확신하는,확실한,어떤"); add(596,"mental","정신의,마음의"); add(597,"thin","얇은,여윈,묽은")
add(598,"expensive","비싼"); add(599,"therefore","그러므로"); add(600,"everywhere","어디에나,어디든지")
add(601,"joy","기쁨"); add(602,"gesture","제스처,몸짓"); add(603,"floor","마루 바닥,층")
add(604,"gate","대문,탑승구"); add(605,"countryside","시골"); add(606,"diet","음식,다이어트")
add(607,"garbage","쓰레기"); add(608,"cash","현금"); add(609,"police","경찰")
add(610,"knowledge","지식"); add(611,"dictionary","사전"); add(612,"amount","양,금액,합계")
add(613,"score","점수,득점하다"); add(614,"cure","치료하다,치료법"); add(615,"adult","어른,성인의")
add(616,"appear","나타나다,~인 것 같다"); add(617,"spread","퍼지다,펴다"); add(618,"hunt","사냥하다")
add(619,"destroy","파괴하다"); add(620,"consider","숙고하다,간주하다,고려하다"); add(621,"expect","기대하다")
add(622,"suggest","제안하다,권하다"); add(623,"cultural","문화의"); add(624,"golden","금빛의,귀중한")
add(625,"comfortable","편안한"); add(626,"unhappy","불행한"); add(627,"weak","약한")
add(628,"crazy","미친,열광적인,화난"); add(629,"outside","밖에,의"); add(630,"quite","꽤,아주")

# 631-720
add(631,"host","주인,주최자"); add(632,"athlete","운동선수"); add(633,"audience","청중,관객,독자")
add(634,"talent","재능 있는 사람"); add(635,"technique","기술,기법"); add(636,"transportation","운송,교통수단")
add(637,"bowl","사발,공기"); add(638,"brick","벽돌"); add(639,"planet","행성,지구")
add(640,"temple","사원,절"); add(641,"tail","꼬리"); add(642,"wing","날개")
add(643,"purpose","목적"); add(644,"suit","정장 한 벌,맞다"); add(645,"frighten","무섭게 하다")
add(646,"scare","무섭게 하다"); add(647,"slip","미끄러지다"); add(648,"melt","녹이다")
add(649,"pollute","오염시키다"); add(650,"affect","영향을 미치다"); add(651,"depend","의존하다")
add(652,"manage","관리하다,해내다"); add(653,"correct","올바른,바로잡다"); add(654,"social","사회의")
add(655,"active","활동적인,적극적인"); add(656,"colorful","울긋불긋한,화려한"); add(657,"wet","젖은,비 오는")
add(658,"wild","야생의,거친"); add(659,"straight","똑바로,똑바른"); add(660,"forever","영원히")
add(661,"god","신,조물주"); add(662,"guest","손님"); add(663,"diver","잠수부")
add(664,"pool","풀,물웅덩이"); add(665,"thought","생각,사고"); add(666,"cancer","암")
add(667,"cell","세포"); add(668,"temperature","온도,기온,체온"); add(669,"crop","농작물,수확량")
add(670,"sheet","시트,종이 한 장"); add(671,"crowd","군중,꽉 채우다"); add(672,"care","돌봄,돌보다")
add(673,"strike","치다,치기"); add(674,"quarter","4분의 1의"); add(675,"relative","친척,상대적인")
add(676,"gain","얻다,획득하다"); add(677,"provide","주다,제공하다"); add(678,"dig","파다,캐다")
add(679,"explore","탐험하다"); add(680,"warn","경고하다"); add(681,"recognize","알아보다")
add(682,"celebrate","축하,기념하다"); add(683,"helpful","도움이 되는"); add(684,"convenient","편리한")
add(685,"impossible","불가능한"); add(686,"medical","의학,의료의"); add(687,"outdoor","야외의")
add(688,"daily","매일의,일상의"); add(689,"indeed","정말,사실은"); add(690,"nowadays","요즘,오늘날에는")
add(691,"wood","나무,목재,숲"); add(692,"cave","동굴"); add(693,"tomb","무덤")
add(694,"tool","도구,연장"); add(695,"satellite","인공위성"); add(696,"communication","의사소통,통신")
add(697,"wealth","재산"); add(698,"attention","주의,주목"); add(699,"addition","더하기")
add(700,"bit","조금,작은 조각"); add(701,"stream","시내,흐름,흐르다"); add(702,"wave","파도,흔들다")
add(703,"value","가치,중요시하다"); add(704,"challenge","도전하다"); add(705,"beat","이기다,박자")
add(706,"support","지지하다,원조하다"); add(707,"chemical","화학물질,화학의"); add(708,"female","여성의,암컷의")
add(709,"fair","공정한,박람회"); add(710,"respond","반응하다,응답하다"); add(711,"fold","접다")
add(712,"deliver","배달하다,전하다"); add(713,"include","포함하다"); add(714,"earn","돈을 벌다,얻다")
add(715,"surprising","놀라운"); add(716,"calm","차분한,고요,진정하다"); add(717,"abstract","추상적인")
add(718,"ahead","앞에,으로"); add(719,"someday","미래의 언젠가"); add(720,"quickly","빨리,곧")

# 721-810
add(721,"hero","남자 영웅,주인공"); add(722,"lawyer","변호사"); add(723,"soil","흙,토양")
add(724,"growth","성장,증가"); add(725,"journey","여행"); add(726,"blood","피,혈액")
add(727,"gun","총,대포"); add(728,"emergency","비상,응급 사태"); add(729,"case","경우,케이스")
add(730,"decision","결정"); add(731,"difficulty","어려움,곤란"); add(732,"fool","바보,속이다")
add(733,"figure","숫자,모습,인물,도형"); add(734,"credit","신용,신뢰하다,외상"); add(735,"tie","묶다,동점이 되다")
add(736,"sweet","단,친절한,단것"); add(737,"boil","끓이다"); add(738,"borrow","빌리다")
add(739,"belong","~에 속하다"); add(740,"communicate","의사소통하다"); add(741,"confuse","혼란시키다")
add(742,"survive","살아남다"); add(743,"scientific","과학의"); add(744,"gentle","온화한,예의바른")
add(745,"mad","화난,열광적인,미친"); add(746,"stupid","어리석은,멍청한"); add(747,"quick","빠른")
add(748,"thick","두꺼운,짙은"); add(749,"mostly","대부분,대개"); add(750,"anywhere","어디든지")
add(751,"officer","장교,관리,임원"); add(752,"stranger","낯선 사람"); add(753,"statue","조각상")
add(754,"spirit","정신,영혼"); add(755,"scenery","경치,풍경"); add(756,"route","길,노선")
add(757,"pole","막대기,장대,극"); add(758,"rubber","고무"); add(759,"structure","구조,구조물")
add(760,"root","뿌리"); add(761,"schedule","일정,시간표,예정하다"); add(762,"charge","요금,책임,청구하다")
add(763,"decrease","줄이다,감소하다"); add(764,"review","복습하다,검토하다"); add(765,"vote","투표하다")
add(766,"patient","환자,참을성 있는"); add(767,"attend","출석하다,돌보다"); add(768,"discuss","토론하다")
add(769,"settle","해결하다,정착하다"); add(770,"elect","투표로 선출하다"); add(771,"achieve","이루다,성취하다")
add(772,"appreciate","감사하다,가치를 깨닫다"); add(773,"brave","용감한"); add(774,"cheap","싼")
add(775,"classical","고전의"); add(776,"familiar","친숙한,익숙한"); add(777,"unknown","미지의,무명의")
add(778,"uncomfortable","불편한"); add(779,"simply","단지,간단히"); add(780,"anyway","어쨌든,아무튼")
add(781,"captain","선장,기장,주장"); add(782,"coast","해안,연안"); add(783,"university","대학")
add(784,"bucket","양동이"); add(785,"cart","짐마차,손수레"); add(786,"cage","새장,우리")
add(787,"kite","연"); add(788,"autumn","가을"); add(789,"breeze","산들바람,미풍")
add(790,"choice","선택"); add(791,"miracle","기적"); add(792,"harvest","수확하다")
add(793,"hike","도보 여행하다"); add(794,"tour","관광 여행하다"); add(795,"offer","제의,제공하다")
add(796,"remain","~인 채로 있다,남아있다"); add(797,"repair","고치다,수리하다"); add(798,"bark","짖다")
add(799,"final","마지막의,결승,기말 시험"); add(800,"public","대중의,공공의"); add(801,"giant","거대한,거인")
add(802,"bend","구부리다"); add(803,"float","뜨다,떠다니다"); add(804,"concentrate","집중하다")
add(805,"handsome","잘생긴"); add(806,"personal","개인의"); add(807,"historic","역사상 중요한")
add(808,"western","서쪽의,서양의"); add(809,"forward","앞으로"); add(810,"exactly","정확하게")

# 811-900
add(811,"flour","곡물 가루"); add(812,"neighborhood","이웃사람들,지역"); add(813,"cyberspace","사이버 공간")
add(814,"situation","상황"); add(815,"strength","힘,세기,강점"); add(816,"will","의지,뜻,유언")
add(817,"development","발전,개발"); add(818,"engineering","공학"); add(819,"level","수준,높이")
add(820,"label","라벨,상표"); add(821,"litter","쓰레기"); add(822,"alarm","경보기,놀라게 하다")
add(823,"cost","비용이 들다"); add(824,"reward","상,보상을 주다"); add(825,"advance","진보하다,전진하다")
add(826,"base","기초를 두다"); add(827,"impress","감명,인상을 주다"); add(828,"wrap","감싸다,포장하다")
add(829,"replace","대신하다,교체하다"); add(830,"fail","실패하다"); add(831,"skip","건너뛰다")
add(832,"necessary","필요한"); add(833,"elementary","기초의,초등학교의"); add(834,"fantastic","환상적인")
add(835,"tasty","맛있는"); add(836,"flat","평평한,바람 빠진"); add(837,"wooden","나무로 만든")
add(838,"crowded","꽉 찬,붐비는"); add(839,"completely","완전히"); add(840,"badly","잘못,서툴게,몹시")
add(841,"climate","기후"); add(842,"degree","도,정도,학위"); add(843,"article","기사,물품")
add(844,"metal","금속"); add(845,"monster","괴물"); add(846,"treasure","보물")
add(847,"symbol","상징,기호"); add(848,"ceremony","의식,의례"); add(849,"congratulation","축하")
add(850,"breath","숨,호흡"); add(851,"death","죽음"); add(852,"headache","두통")
add(853,"muscle","근육"); add(854,"dot","점을 찍다"); add(855,"lock","자물쇠를 채우다")
add(856,"shock","깜짝 놀라게 하다,충격"); add(857,"dislike","싫어하다"); add(858,"feed","먹을 것을 주다")
add(859,"lend","빌려주다"); add(860,"suffer","고통을 겪다"); add(861,"hang","매달리다")
add(862,"pleasant","쾌적한,유쾌한,상냥한"); add(863,"lonely","외로운"); add(864,"thirsty","목마른")
add(865,"polite","예의 바른,공손한"); add(866,"rude","무례한"); add(867,"dead","죽은")
add(868,"overweight","과체중의"); add(869,"perhaps","아마도"); add(870,"twice","두 번,두 배로")
add(871,"heaven","천국,하늘"); add(872,"helicopter","헬리콥터"); add(873,"castle","성")
add(874,"doll","인형"); add(875,"kindness","친절"); add(876,"concentration","집중")
add(877,"mystery","신비,불가사의"); add(878,"mess","엉망,혼란"); add(879,"battle","전투,다툼")
add(880,"government","정부"); add(881,"industry","산업,공업,근면"); add(882,"bloom","꽃피다")
add(883,"focus","초점을 맞추다,집중하다"); add(884,"joke","농담하다"); add(885,"average","평균의")
add(886,"predict","예언하다"); add(887,"compare","비교하다"); add(888,"complain","불평하다")
add(889,"forgive","용서하다"); add(890,"determine","결정하다"); add(891,"exist","존재하다")
add(892,"dive","다이빙,잠수하다"); add(893,"upper","위쪽의,높은"); add(894,"central","중심,중앙의")
add(895,"normal","정상의"); add(896,"similar","비슷한"); add(897,"tough","힘든,강인한,질긴")
add(898,"ashamed","부끄러워하는"); add(899,"anymore","더 이상"); add(900,"besides","게다가,그 밖에")

# 901-990
add(901,"happiness","행복"); add(902,"freedom","자유"); add(903,"independence","독립")
add(904,"imagination","상상력"); add(905,"importance","중요성"); add(906,"speech","말,연설")
add(907,"silence","침묵"); add(908,"invitation","초대"); add(909,"exhibition","전시회")
add(910,"sculpture","조각품"); add(911,"height","높이,키"); add(912,"stage","단계,무대")
add(913,"zone","지대,구역"); add(914,"forecast","예보하다"); add(915,"sink","가라앉다,개수대")
add(916,"extra","여분의,추가의"); add(917,"advise","조언,충고하다"); add(918,"recommend","추천하다")
add(919,"declare","선언하다,신고하다"); add(920,"prove","증명하다,판명되다"); add(921,"injure","상처를 입히다")
add(922,"connect","연결,접속하다"); add(923,"weigh","무게가~이다"); add(924,"foggy","안개 낀")
add(925,"salty","짠"); add(926,"neat","말끔한,깔끔한"); add(927,"lazy","게으른")
add(928,"loose","풀린,헐거운"); add(929,"endangered","멸종 위기에 처한"); add(930,"recently","요즈음,최근")
add(931,"self","자기자신,자아"); add(932,"population","인구"); add(933,"visitor","방문객")
add(934,"stomach","위,배,복부"); add(935,"portrait","초상화"); add(936,"screen","화면,스크린")
add(937,"darkness","어둠"); add(938,"earthquake","지진"); add(939,"weapon","무기")
add(940,"edge","가장자리,날"); add(941,"saying","속담,격언"); add(942,"signal","신호를 보내다")
add(943,"pattern","양식,무늬"); add(944,"graduate","졸업하다,졸업생"); add(945,"swallow","삼키다,제비")
add(946,"official","공식의,관리,임원"); add(947,"gray","회색의,백발의"); add(948,"prefer","더 좋아하다,선호하다")
add(949,"relax","쉬다,긴장을 풀다"); add(950,"reduce","줄이다,감소하다"); add(951,"bury","묻다,매장하다")
add(952,"shoot","쏘다,슛하다,촬영하다"); add(953,"yell","외치다,소리치다"); add(954,"powerful","강력한")
add(955,"faithful","충실한,믿음직한"); add(956,"noisy","시끄러운"); add(957,"deaf","귀가 먼")
add(958,"electronic","전자의"); add(959,"nearly","거의,가까스로"); add(960,"happily","행복하게,다행히도")
add(961,"chairperson","의장,회장"); add(962,"customer","고객"); add(963,"astronaut","우주 비행사")
add(964,"dynasty","왕조"); add(965,"dragon","용"); add(966,"flea","벼룩")
add(967,"greenhouse","온실"); add(968,"landscape","풍경화"); add(969,"dirt","먼지,때,흙")
add(970,"shot","발사,던지기,주사"); add(971,"curve","곡선,커브"); add(972,"stuff","물건,재료,채우다")
add(973,"pack","짐을 싸다,상자"); add(974,"spill","엎지르다"); add(975,"debate","토론하다")
add(976,"whisper","속삭이다,속삭임"); add(977,"lay","눕히다,놓다,알을 낳다"); add(978,"pardon","용서하다")
add(979,"beg","간청하다,구걸하다"); add(980,"relate","관련되다,관련시키다"); add(981,"direct","직접의,지시하다")
add(982,"intelligent","지능이 높은,총명한"); add(983,"eager","열망하는"); add(984,"disabled","장애가 있는")
add(985,"homeless","집 없는"); add(986,"harmful","해로운"); add(987,"lifelong","평생의")
add(988,"nearby","가까운,가까이"); add(989,"seldom","좀처럼~않는,드물게"); add(990,"somewhere","어딘가에")

# 991-1080
add(991,"birth","태어남,출생"); add(992,"childhood","어린 시절"); add(993,"education","교육")
add(994,"emotion","감정"); add(995,"attitude","태도"); add(996,"courage","용기")
add(997,"condition","건강 상태,조건"); add(998,"fever","열,열병"); add(999,"conversation","대화")
add(1000,"adventure","모험"); add(1001,"triangle","삼각형"); add(1002,"bulb","전구,알뿌리")
add(1003,"attack","공격하다,발작"); add(1004,"cough","기침하다"); add(1005,"flow","흐르다,흐름")
add(1006,"search","찾다,수색하다"); add(1007,"original","원래의,독창적인"); add(1008,"opposite","정반대의,반대쪽의")
add(1009,"jog","조깅하다"); add(1010,"scan","살펴보다,스캔하다"); add(1011,"describe","묘사,기술하다")
add(1012,"freeze","얼리다"); add(1013,"remove","제거하다,치우다"); add(1014,"single","단 하나의,독신의")
add(1015,"positive","긍정적인"); add(1016,"nervous","초조한,신경의"); add(1017,"ugly","추한")
add(1018,"northern","북쪽의"); add(1019,"downtown","도심지로,에"); add(1020,"actually","실제로,참으로")
add(1021,"generation","세대"); add(1022,"lifetime","일생,평생"); add(1023,"fitness","건강")
add(1024,"memory","추억,기억"); add(1025,"fur","모피"); add(1026,"furniture","가구")
add(1027,"engine","엔진,기관차"); add(1028,"balloon","풍선"); add(1029,"border","국경,경계선")
add(1030,"disaster","재해,재난"); add(1031,"fear","두려움,두려워하다"); add(1032,"regard","안부인사,여기다")
add(1033,"chat","잡담하다,채팅하다"); add(1034,"exchange","교환,주고받다"); add(1035,"glue","아교로 붙이다")
add(1036,"puzzle","퍼즐,혼란시키다"); add(1037,"characteristic","특성,특유의"); add(1038,"professional","전문의,직업인")
add(1039,"encourage","용기를 북돋우다"); add(1040,"reflect","비추다,반사하다,반영하다"); add(1041,"slide","미끄러져 움직이다")
add(1042,"stretch","잡아 늘리다,펴다"); add(1043,"steal","훔치다"); add(1044,"separate","분리된,분리하다")
add(1045,"anxious","걱정하는,열망하는"); add(1046,"asleep","잠든"); add(1047,"effective","효과적인")
add(1048,"due","때문에,기한이 된"); add(1049,"upside down","거꾸로,뒤집혀"); add(1050,"rather","오히려,다소")
add(1051,"manager","관리,경영자,지배인"); add(1052,"thief","도둑"); add(1053,"grain","곡물,낱알")
add(1054,"shore","바닷가,호숫가"); add(1055,"sand","모래사장"); add(1056,"lighting","조명")
add(1057,"wire","철사,전선"); add(1058,"harmony","조화"); add(1059,"prediction","예언,예측")
add(1060,"marriage","결혼"); add(1061,"period","기간,시대,수업시간"); add(1062,"issue","문제,쟁점,발행하다")
add(1063,"quarrel","말다툼하다"); add(1064,"limit","한계,제한하다"); add(1065,"harm","손해,해치다")
add(1066,"tap","톡톡 두드리다,수도꼭지"); add(1067,"spray","물을 뿌리다,분무기"); add(1068,"pray","빌다,기원하다")
add(1069,"greet","인사하다"); add(1070,"chew","씹다"); add(1071,"attract","관심을 끌다,매혹하다")
add(1072,"overcome","극복하다"); add(1073,"southern","남쪽의"); add(1074,"creative","창조적인")
add(1075,"curious","호기심 강한"); add(1076,"honest","정직한"); add(1077,"humorous","유머가 넘치는")
add(1078,"foolish","어리석은"); add(1079,"greedy","탐욕스러운"); add(1080,"certainly","확실히,물론")

# 1081-1170
add(1081,"agent","대리인,대행사"); add(1082,"politics","정치"); add(1083,"reality","현실")
add(1084,"relationship","관계"); add(1085,"role","역할"); add(1086,"theater","극장,연극")
add(1087,"performance","공연,수행"); add(1088,"cast","깁스,배역"); add(1089,"reservation","예약")
add(1090,"sightseeing","관광"); add(1091,"path","작은 길,오솔길"); add(1092,"source","원천,근원,출처")
add(1093,"proof","증거"); add(1094,"term","기간,한,용어"); add(1095,"net","인터넷,그물")
add(1096,"claim","주장하다,요구하다"); add(1097,"deal","다루다,거래하다"); add(1098,"hatch","부화하다")
add(1099,"clap","손뼉을 치다"); add(1100,"announce","발표하다"); add(1101,"represent","나타내다,대표하다")
add(1102,"devote","바치다,전념하다"); add(1103,"peaceful","평화로운"); add(1104,"painful","아픈,고통스러운")
add(1105,"sharp","날카로운"); add(1106,"excellent","뛰어난,탁월한"); add(1107,"responsible","책임 있는")
add(1108,"ill","병든,나쁜"); add(1109,"likely","~할 것 같은"); add(1110,"immediately","즉시")
add(1111,"ancestor","조상,선조"); add(1112,"architect","건축가"); add(1113,"enemy","적")
add(1114,"throat","목구멍"); add(1115,"illness","병"); add(1116,"drug","약")
add(1117,"weed","잡초"); add(1118,"humor","유머"); add(1119,"volcano","화산")
add(1120,"kingdom","왕국"); add(1121,"attempt","시도하다"); add(1122,"award","상을 주다")
add(1123,"broadcast","방송하다"); add(1124,"nod","끄덕이다,끄덕임"); add(1125,"escape","도망,탈출하다")
add(1126,"aid","돕다,원조하다"); add(1127,"measure","재다,측정하다,조치"); add(1128,"envy","부러워하다,부러움")
add(1129,"total","전체의,총계,완전한"); add(1130,"worth","가치가 있는"); add(1131,"embarrass","당황하게 하다")
add(1132,"erupt","화산이 폭발하다"); add(1133,"perform","공연하다,수행하다"); add(1134,"publish","발행,출판하다")
add(1135,"silent","침묵하는,조용한"); add(1136,"silly","어리석은"); add(1137,"scary","무서운")
add(1138,"sore","아픈,쑤시는"); add(1139,"bitter","쓴,쓰라린"); add(1140,"lately","요즈음,최근")
add(1141,"career","직업,경력"); add(1142,"economy","경제"); add(1143,"construction","건설")
add(1144,"mood","기분,분위기"); add(1145,"excitement","흥분"); add(1146,"complaint","불평,항의")
add(1147,"invasion","침략,침해"); add(1148,"container","용기,그릇"); add(1149,"ash","재")
add(1150,"contact","접촉,연락하다"); add(1151,"benefit","이익을 주다,얻다"); add(1152,"damage","손해를 입히다")
add(1153,"supply","공급품,공급하다"); add(1154,"demand","수요,요구하다"); add(1155,"lack","부족하다,결핍되다")
add(1156,"conflict","갈등,충돌하다"); add(1157,"chief","장,우두머리,최고의"); add(1158,"spin","빠르게 돌리다")
add(1159,"scratch","긁다,할퀴다"); add(1160,"suppose","추측하다,가정하다"); add(1161,"refer","언급하다,참조하다")
add(1162,"ruin","망치다,파멸시키다"); add(1163,"rid","제거하다,벗어나게하다"); add(1164,"tight","꽉 끼는,팽팽한")
add(1165,"brilliant","빛나는,재기 넘치는"); add(1166,"specific","특정한,구체적인"); add(1167,"unusual","보통이 아닌,별난")
add(1168,"negative","부정적인"); add(1169,"royal","왕의"); add(1170,"partly","부분적으로,일부")

# 1171-1260
add(1171,"happiness","행복"); add(1172,"freedom","자유"); add(1173,"independence","독립")
add(1174,"imagination","상상력"); add(1175,"importance","중요성"); add(1176,"speech","말,연설")
add(1177,"silence","침묵"); add(1178,"invitation","초대"); add(1179,"exhibition","전시회")
add(1180,"sculpture","조각품"); add(1181,"height","높이,키"); add(1182,"stage","단계,무대")
add(1183,"zone","지대,구역"); add(1184,"forecast","예보하다"); add(1185,"sink","가라앉다,개수대")
add(1186,"extra","여분의,추가의"); add(1187,"advise","조언,충고하다"); add(1188,"recommend","추천하다")
add(1189,"declare","선언하다,신고하다"); add(1190,"prove","증명하다,판명되다"); add(1191,"injure","상처를 입히다")
add(1192,"connect","연결,접속하다"); add(1193,"weigh","무게가~이다"); add(1194,"foggy","안개 낀")
add(1195,"salty","짠"); add(1196,"neat","말끔한,깔끔한"); add(1197,"lazy","게으른")
add(1198,"loose","풀린,헐거운"); add(1199,"endangered","멸종 위기에 처한"); add(1200,"recently","요즈음,최근")
add(1201,"merchant","상인"); add(1202,"narrator","해설자,내레이터"); add(1203,"organization","조직,단체")
add(1204,"kindergarten","유치원"); add(1205,"management","관리,경영"); add(1206,"operation","수술,운전,작전")
add(1207,"mission","특별 임무,선교"); add(1208,"means","수단,방법"); add(1209,"confidence","신뢰,자신감")
add(1210,"merit","장점,가치"); add(1211,"mirror","거울"); add(1212,"ladder","사다리")
add(1213,"ingredient","재료,요소"); add(1214,"index","색인,지표,지수"); add(1215,"arrange","준비하다,배열하다")
add(1216,"behave","행동하다"); add(1217,"compete","경쟁하다"); add(1218,"argue","말다툼하다,주장하다")
add(1219,"release","풀어주다,내놓다"); add(1220,"pretend","~인 체하다"); add(1221,"conclude","결론을 내리다")
add(1222,"valuable","값비싼,귀중한"); add(1223,"terrific","훌륭한,멋진,굉장한"); add(1224,"steady","꾸준한,안정된")
add(1225,"spare","여벌의,여가의"); add(1226,"unique","유일한,독특한"); add(1227,"unnecessary","불필요한")
add(1228,"bound","꼭 할 것 같은"); add(1229,"underground","지하의,에"); add(1230,"sincerely","진심으로")
add(1231,"position","위치,자세,지위"); add(1232,"peer","또래"); add(1233,"pressure","압력")
add(1234,"association","협회"); add(1235,"playground","놀이터,운동장"); add(1236,"pond","연못")
add(1237,"harbor","항구"); add(1238,"frame","틀,테"); add(1239,"hammer","망치")
add(1240,"payment","지불액"); add(1241,"heritage","유산"); add(1242,"package","꾸러미,포장하다")
add(1243,"trust","신뢰,신용하다"); add(1244,"panic","공포를 느끼다"); add(1245,"crash","충돌,추락하다")
add(1246,"rinse","가볍게 씻어내다"); add(1247,"appeal","호소하다"); add(1248,"sweep","쓸다,청소하다")
add(1249,"consist","이루어져 있다"); add(1250,"unify","통일하다"); add(1251,"depress","우울하게 하다")
add(1252,"blame","~의 탓으로 돌리다"); add(1253,"smooth","매끄러운,부드러운"); add(1254,"spicy","매운")
add(1255,"helpless","스스로 돌볼 수 없는"); add(1256,"incredible","믿을 수 없는,엄청난"); add(1257,"available","이용할 수 있는")
add(1258,"ancient","고대의,옛날의"); add(1259,"moral","도덕,윤리의,교훈"); add(1260,"thus","그래서,그러므로")

# 1261-1350
add(1261,"wildlife","야생 생물"); add(1262,"region","지역"); add(1263,"sunset","해넘이,일몰")
add(1264,"steam","증기"); add(1265,"warmth","따뜻함"); add(1266,"statement","성명,진술")
add(1267,"response","반응,응답"); add(1268,"task","과업,임무"); add(1269,"quality","품질")
add(1270,"security","보안,안보,보호"); add(1271,"needle","바늘"); add(1272,"thread","실을 꿰다")
add(1273,"row","줄,열,배를 젓다"); add(1274,"survey","조사하다"); add(1275,"sigh","한숨짓다")
add(1276,"hug","껴안다,포옹하다"); add(1277,"wipe","닦아내다"); add(1278,"operate","작동하다,수술하다")
add(1279,"contain","포함하다"); add(1280,"preserve","보존,보호하다"); add(1281,"refuse","거절,거부하다")
add(1282,"remind","기억나게 하다"); add(1283,"tiny","아주 작은"); add(1284,"curly","곱슬곱슬한")
add(1285,"rapid","매우 빠른,신속한"); add(1286,"recent","최근의"); add(1287,"comic","희극의,웃기는")
add(1288,"violent","폭력적인"); add(1289,"worldwide","세계적인,세계 곳곳에"); add(1290,"highly","매우,고도로")
add(1291,"dinosaur","공룡"); add(1292,"ruler","지배자,자"); add(1293,"admiral","해군 장군")
add(1294,"liberty","자유"); add(1295,"unification","통일"); add(1296,"trial","재판,시도")
add(1297,"treatment","치료"); add(1298,"shelter","집,피난처"); add(1299,"orphanage","고아원")
add(1300,"item","품목,항목"); add(1301,"firewood","장작,땔나무"); add(1302,"range","범위")
add(1303,"horizon","수평선,지평선"); add(1304,"rumor","소문"); add(1305,"sew","꿰매다,바느질하다")
add(1306,"unite","합치다"); add(1307,"associate","연상하다"); add(1308,"identify","정체,신원을 확인하다")
add(1309,"mention","언급하다"); add(1310,"establish","설립,확립하다"); add(1311,"entertain","즐겁게 하다")
add(1312,"frustrate","좌절시키다"); add(1313,"blonde","금발의"); add(1314,"cheerful","명랑한,유쾌한")
add(1315,"careless","부주의한"); add(1316,"dull","지루한,무딘"); add(1317,"disgusting","역겨운,메스꺼운")
add(1318,"eastern","동쪽의"); add(1319,"civil","시민의,민간의"); add(1320,"apart","떨어져 있는")
add(1321,"lung","폐,허파"); add(1322,"passport","여권"); add(1323,"photo","사진")
add(1324,"envelope","봉투"); add(1325,"attendant","시중드는 사람"); add(1326,"dessert","디저트,후식")
add(1327,"appointment","만날 약속,임명"); add(1328,"midnight","자정"); add(1329,"skyscraper","마천루,초고층 건물")
add(1330,"chimney","굴뚝"); add(1331,"fence","울타리,담"); add(1332,"branch","가지,지점")
add(1333,"aim","목표로 삼다,겨누다"); add(1334,"research","연구하다"); add(1335,"leap","뛰어오르다,도약하다")
add(1336,"scream","소리,비명을 지르다"); add(1337,"refresh","기운 나게 하다"); add(1338,"occur","일어나다,생각나다")
add(1339,"obtain","얻다,획득하다"); add(1340,"intend","작정이다,의도하다"); add(1341,"lower","낮추다,아래의")
add(1342,"lean","몸을 구부리다,기대다"); add(1343,"equal","같은,동등한,같다"); add(1344,"shy","수줍어하는")
add(1345,"hardworking","열심히 일하는,근면한"); add(1346,"hopeless","희망 없는"); add(1347,"various","여러 가지의,다양한")
add(1348,"raw","날것의"); add(1349,"portable","휴대용의"); add(1350,"rarely","드물게,좀처럼~않다")

# 1351-1440
add(1351,"continent","대륙"); add(1352,"port","항구도시"); add(1353,"cooperation","협력,협동")
add(1354,"competition","경쟁,경기,대회"); add(1355,"convenience","편리,편의"); add(1356,"curiosity","호기심")
add(1357,"suicide","자살"); add(1358,"bullet","총알"); add(1359,"backbone","등뼈,척추")
add(1360,"descendant","자손,후손"); add(1361,"collection","수집품"); add(1362,"rhyme","시의 각운")
add(1363,"desire","욕구,욕망,바라다"); add(1364,"contrast","대조하다,대비되다"); add(1365,"leak","새다,누출")
add(1366,"stare","빤히 보다,응시하다"); add(1367,"deceive","속이다"); add(1368,"snap","딱 부러지다")
add(1369,"twist","비틀다,꼬다"); add(1370,"decorate","꾸미다,장식하다"); add(1371,"convert","바꾸다,변환하다")
add(1372,"tend","~하는 경향이 있다"); add(1373,"firm","회사,단단한,굳은"); add(1374,"senior","최상급생,연장자")
add(1375,"major","주요한,전공"); add(1376,"minor","중요하지 않은,미성년자"); add(1377,"grand","웅대한")
add(1378,"odd","이상한,잡다한,홀수의"); add(1379,"awkward","어색한"); add(1380,"directly","직접,똑바로")
add(1381,"nail","손톱,발톱,못"); add(1382,"gym","체육관,체조"); add(1383,"grave","무덤")
add(1384,"instance","예,보기"); add(1385,"evidence","증거"); add(1386,"expression","표현")
add(1387,"feature","특징"); add(1388,"element","요소,성분"); add(1389,"nutrient","영양분,영양소")
add(1390,"dozen","다스,12개"); add(1391,"honesty","정직"); add(1392,"duty","의무,세금")
add(1393,"failure","실패"); add(1394,"flavor","맛을 내다"); add(1395,"march","행진하다")
add(1396,"yawn","하품하다"); add(1397,"delay","미루다,연기하다,지연"); add(1398,"satisfy","만족시키다")
add(1399,"misunderstand","오해하다"); add(1400,"scold","꾸짖다"); add(1401,"observe","관찰하다,지키다")
add(1402,"rub","문지르다"); add(1403,"drown","익사하다"); add(1404,"proper","적절한")
add(1405,"usual","보통의,평소의"); add(1406,"urgent","긴급한"); add(1407,"genetic","유전자의")
add(1408,"military","군사의"); add(1409,"willing","기꺼이 하는"); add(1410,"fully","완전히,충분히")
add(1411,"laughter","웃음소리"); add(1412,"amusement","재미,오락"); add(1413,"servant","하인")
add(1414,"palm","손바닥,야자"); add(1415,"movement","움직임,운동"); add(1416,"location","위치,장소")
add(1417,"equipment","장비,설비"); add(1418,"refrigerator","냉장고"); add(1419,"production","생산")
add(1420,"rate","비율"); add(1421,"relation","관계"); add(1422,"religion","종교")
add(1423,"plenty","많음,충분함"); add(1424,"load","짐을 싣다"); add(1425,"ache","아프다,아픔,통증")
add(1426,"handle","손으로 다루다,손잡이"); add(1427,"individual","개인의,개개의"); add(1428,"admire","존경하다,감탄하다")
add(1429,"apologize","사과하다"); add(1430,"threaten","위협,협박하다"); add(1431,"arrest","체포하다")
add(1432,"commit","나쁜 일을 저지르다"); add(1433,"attractive","매력적인"); add(1434,"awful","끔찍한,지독한,굉장한")
add(1435,"casual","평상시의,무심한"); add(1436,"conscious","의식하고 있는"); add(1437,"capable","~을 할 수 있는")
add(1438,"absent","결석한,없는"); add(1439,"alike","비슷한,같은"); add(1440,"otherwise","그렇지 않으면,달리")

# 1441-1530
add(1441,"passenger","승객"); add(1442,"vehicle","탈것,차량"); add(1443,"tale","이야기")
add(1444,"suggestion","제안"); add(1445,"responsibility","책임"); add(1446,"risk","위험")
add(1447,"intelligence","지능"); add(1448,"viewpoint","관점,시각"); add(1449,"scissors","가위")
add(1450,"shell","단단한 껍질,조가비"); add(1451,"surface","표면"); add(1452,"version","개정판")
add(1453,"account","계좌,설명하다"); add(1454,"influence","영향을 미치다"); add(1455,"fasten","단단히 고정하다")
add(1456,"manufacture","제조하다"); add(1457,"hire","고용하다"); add(1458,"examine","조사,검진하다")
add(1459,"explode","폭발하다"); add(1460,"erase","지우다"); add(1461,"interrupt","가로막다,중단하다")
add(1462,"deny","부정,부인하다"); add(1463,"former","이전의,전~"); add(1464,"clever","영리한")
add(1465,"distant","먼"); add(1466,"faint","희미한"); add(1467,"double","2배의,이중의")
add(1468,"entire","전체,전부의"); add(1469,"frequent","자주 일어나는,빈번한"); add(1470,"possibly","아마,어떻게든")
add(1471,"author","저자"); add(1472,"secretary","비서"); add(1473,"beggar","거지")
add(1474,"shepherd","양치기"); add(1475,"fable","우화"); add(1476,"tongue","혀,말,언어")
add(1477,"departure","출발"); add(1478,"entrance","입구,입학,입장"); add(1479,"method","방법")
add(1480,"aptitude","적성"); add(1481,"victory","승리"); add(1482,"blossom","꽃피다")
add(1483,"praise","칭찬하다"); add(1484,"wind","감다,돌리다,바람"); add(1485,"billion","10억의")
add(1486,"ideal","이상,이상적인"); add(1487,"require","필요로 하다,요구하다"); add(1488,"tremble","떨다")
add(1489,"starve","굶주리다"); add(1490,"quit","그만두다,끊다"); add(1491,"spoil","망치다")
add(1492,"punish","벌하다"); add(1493,"translate","번역하다"); add(1494,"wealthy","부유한")
add(1495,"independent","독립된"); add(1496,"mild","온화한,온순한"); add(1497,"harsh","가혹한,거친")
add(1498,"informal","비공식의"); add(1499,"lunar","달의"); add(1500,"overseas","해외로,에")
add(1501,"citizen","시민,국민"); add(1502,"client","의뢰인,고객"); add(1503,"clown","어릿광대")
add(1504,"immigrant","이민자"); add(1505,"baggage","여행 수하물"); add(1506,"chain","사슬,연쇄점")
add(1507,"coal","석탄"); add(1508,"bubble","거품"); add(1509,"bug","작은 곤충")
add(1510,"dawn","새벽"); add(1511,"detail","세부 사항"); add(1512,"delight","기쁨,기쁘게 하다")
add(1513,"plug","플러그를 꽂다,마개"); add(1514,"dispute","논쟁하다"); add(1515,"flame","불꽃,불타다")
add(1516,"flash","번쩍 빛나다,섬광"); add(1517,"regret","후회하다"); add(1518,"junior","연소자의")
add(1519,"select","고르다,뽑다"); add(1520,"spell","철자를 쓰다"); add(1521,"surround","둘러싸다")
add(1522,"swear","맹세하다,욕하다"); add(1523,"wander","배회하다,돌아다니다"); add(1524,"generous","인심 좋은,관대한")
add(1525,"grateful","고마워하는"); add(1526,"instant","즉시의,즉석의"); add(1527,"medium","중간의")
add(1528,"needy","가난한"); add(1529,"nuclear","핵의,원자력의"); add(1530,"either","둘 중 어느 한쪽의")

# 1531-1620
add(1531,"counselor","카운슬러,상담원"); add(1532,"opportunity","기회"); add(1533,"literature","문학")
add(1534,"illusion","환상,착각"); add(1535,"leisure","여가,레저"); add(1536,"shuttle","우주 왕복선")
add(1537,"fare","운임"); add(1538,"laundry","세탁물,세탁소"); add(1539,"prison","감옥,교도소")
add(1540,"germ","병균,싹"); add(1541,"length","길이"); add(1542,"similarity","유사점")
add(1543,"sort","종류,분류하다"); add(1544,"export","수출하다"); add(1545,"rent","임차,임대하다")
add(1546,"commercial","상업의,광고 방송"); add(1547,"complex","복잡한,단지"); add(1548,"bore","지루하게 하다")
add(1549,"shut","닫다"); add(1550,"compose","구성하다,작곡하다"); add(1551,"mend","고치다,수리하다")
add(1552,"inform","알리다,통지하다"); add(1553,"calculate","계산하다"); add(1554,"ordinary","보통의,평범한")
add(1555,"private","사적인"); add(1556,"selfish","이기적인"); add(1557,"strict","엄격한")
add(1558,"sour","맛이 신"); add(1559,"outer","밖의,외부의"); add(1560,"neither","어느 쪽도 아니다")
add(1561,"appetite","식욕"); add(1562,"beast","짐승,야수"); add(1563,"blackboard","칠판")
add(1564,"lab","실험실"); add(1565,"institute","연구소,기관"); add(1566,"journalism","저널리즘,언론계")
add(1567,"outline","개요,윤곽"); add(1568,"crosswalk","횡단보도"); add(1569,"oar","배의 노")
add(1570,"charm","매력,매혹하다"); add(1571,"doubt","의심하다"); add(1572,"force","힘,무력,강요하다")
add(1573,"function","기능을 하다"); add(1574,"assist","돕다,도움주기"); add(1575,"evil","악한")
add(1576,"employ","고용하다"); add(1577,"govern","통치하다"); add(1578,"bless","축복하다")
add(1579,"criticize","비난하다,비평하다"); add(1580,"indicate","가리키다"); add(1581,"react","반응하다")
add(1582,"dare","감히~하다"); add(1583,"satisfactory","만족스러운"); add(1584,"confident","자신 있는,확신하는")
add(1585,"cruel","잔인한"); add(1586,"broad","넓은"); add(1587,"typical","전형적인")
add(1588,"extracurricular","과외의"); add(1589,"underwater","물속의"); add(1590,"fairly","꽤,공정하게")
add(1591,"conductor","지휘자,차장"); add(1592,"court","법정,코트,궁정"); add(1593,"dictation","받아쓰기")
add(1594,"jam","먹는 잼,막힘,혼잡"); add(1595,"string","끈,줄,악기의 현"); add(1596,"salary","봉급")
add(1597,"scale","규모,등급,저울"); add(1598,"spot","장소,지점,점"); add(1599,"shame","부끄러움,수치,유감")
add(1600,"chemistry","화학"); add(1601,"futurology","미래학"); add(1602,"import","수입하다")
add(1603,"link","연결하다,고리"); add(1604,"pause","잠시 멈추다,일시 중지"); add(1605,"assistant","조수,보조의")
add(1606,"liquid","액체의"); add(1607,"solid","고체의,단단한"); add(1608,"apply","지원하다,적용하다")
add(1609,"possess","소유하다"); add(1610,"contribute","기부하다,기여하다"); add(1611,"recover","회복하다")
add(1612,"ignore","무시하다"); add(1613,"diligent","부지런한,근면한"); add(1614,"pale","창백한,엷은")
add(1615,"brief","짧은,간단한"); add(1616,"narrow","좁은"); add(1617,"rare","드문,살짝 구운")
add(1618,"historical","역사학의"); add(1619,"holy","신성한,성스러운"); add(1620,"unfortunately","불행히도")

# 1621-1710
add(1621,"skin","피부,가죽,껍질"); add(1622,"blanket","담요"); add(1623,"chalk","분필")
add(1624,"document","문서"); add(1625,"license","면허증"); add(1626,"fortune","큰돈,행운")
add(1627,"resource","자원"); add(1628,"hunger","배고픔,굶주림"); add(1629,"error","잘못,실수,오류")
add(1630,"crime","범죄"); add(1631,"jail","감옥,교도소"); add(1632,"progress","진보,발전하다")
add(1633,"request","요청하다"); add(1634,"trade","매매,사고팔다"); add(1635,"bomb","폭탄,폭파하다")
add(1636,"poison","독,독살하다"); add(1637,"wound","상처를 입히다"); add(1638,"chase","추적,추구하다")
add(1639,"absorb","빨아들이다,흡수하다"); add(1640,"attach","붙이다,첨부하다"); add(1641,"cooperate","협력,협동하다")
add(1642,"defend","방어하다"); add(1643,"aware","알아차린,알고 있는"); add(1644,"obvious","명백한")
add(1645,"precious","귀중한,소중한"); add(1646,"political","정치의"); add(1647,"illegal","불법의")
add(1648,"indoor","실내의"); add(1649,"solar","태양의"); add(1650,"aloud","소리 내어")
add(1651,"universe","우주"); add(1652,"atmosphere","대기,분위기"); add(1653,"voyage","긴 항해")
add(1654,"navy","해군"); add(1655,"instrument","기구,도구,악기"); add(1656,"tube","관,통,튜브")
add(1657,"leather","가죽"); add(1658,"jewel","보석"); add(1659,"mud","진흙")
add(1660,"target","목표,표적,과녁"); add(1661,"aspect","면,양상"); add(1662,"anger","화")
add(1663,"iron","철,다리미질하다"); add(1664,"comment","논평하다"); add(1665,"concern","걱정,관심,관계되다")
add(1666,"dump","내버리다,쓰레기장"); add(1667,"plain","명백한,간소한,평야"); add(1668,"enable","~할 수 있게 하다")
add(1669,"annoy","화나게 하다,짜증나게 하다"); add(1670,"insist","주장하다,우기다"); add(1671,"combine","결합하다")
add(1672,"owe","빚지고 있다"); add(1673,"cease","그만두다,그치다"); add(1674,"awake","깨어있는,깨우다")
add(1675,"previous","이전의"); add(1676,"efficient","능률,효율적인"); add(1677,"rough","거친,대략의")
add(1678,"severe","심각한,엄한"); add(1679,"romantic","낭만적인"); add(1680,"sometime","언젠가")
add(1681,"democracy","민주주의"); add(1682,"justice","정의"); add(1683,"faith","신뢰,신앙")
add(1684,"glory","영광"); add(1685,"apology","사과"); add(1686,"crisis","위기")
add(1687,"debt","빚,부채"); add(1688,"gap","틈,격차"); add(1689,"novel","소설")
add(1690,"theory","이론,학설"); add(1691,"nest","둥지,보금자리"); add(1692,"labor","육체노동하다")
add(1693,"remark","논평,발언하다"); add(1694,"comfort","위로하다,편안"); add(1695,"approach","접근하다")
add(1696,"struggle","투쟁하다"); add(1697,"content","내용물,만족하고 있는"); add(1698,"acid","산성의")
add(1699,"differ","다르다"); add(1700,"deserve","~할 받을 만하다"); add(1701,"permit","허락,허가하다")
add(1702,"forbid","금지하다,막다"); add(1703,"reject","거부,거절하다"); add(1704,"pure","순수한,맑은")
add(1705,"dumb","멍청한,벙어리의"); add(1706,"slight","약간의,가벼운"); add(1707,"particular","특정한,특별한")
add(1708,"financial","재정의,금융의"); add(1709,"fond","좋아하는"); add(1710,"aboard","배,비행기를 타고")

# 1711-1800
add(1711,"identity","신원,정체성"); add(1712,"devil","악마,마귀"); add(1713,"spectator","관객,구경꾼")
add(1714,"recreation","오락,레크리에이션"); add(1715,"income","수입,소득"); add(1716,"tax","세금")
add(1717,"fee","요금,수수료"); add(1718,"fuel","연료"); add(1719,"burden","짐,부담")
add(1720,"selection","선발,선택"); add(1721,"sum","금액,합계,요약하다"); add(1722,"profit","이익을 얻다")
add(1723,"process","과정,처리하다"); add(1724,"exit","출구,나가다"); add(1725,"purchase","사다,구입하다")
add(1726,"defeat","이기다,패배시키다"); add(1727,"persuade","설득하다"); add(1728,"emphasize","강조하다")
add(1729,"accuse","고발,고소하다"); add(1730,"investigate","조사하다"); add(1731,"distinguish","구별,식별하다")
add(1732,"adopt","입양하다,채택하다"); add(1733,"idle","한가한,빈둥거리다"); add(1734,"primary","주요한,초기의")
add(1735,"sufficient","충분한"); add(1736,"accurate","정확한"); add(1737,"complicated","복잡한")
add(1738,"artificial","인공,인조의"); add(1739,"tropical","열대성의"); add(1740,"hardly","거의~않다")
add(1741,"knee","무릎"); add(1742,"pupil","학생,눈동자"); add(1743,"profession","전문직")
add(1744,"occupation","직업,점령"); add(1745,"instruction","사용 설명서,지시"); add(1746,"principle","원칙,원리")
add(1747,"tradition","전통"); add(1748,"revolution","혁명"); add(1749,"authority","권한,권위,당국")
add(1750,"rank","계급,지위"); add(1751,"property","재산"); add(1752,"advantage","유리한 점,이점")
add(1753,"affair","일,문제,사건"); add(1754,"occasion","때,경우,특별한 행사"); add(1755,"protest","항의하다")
add(1756,"propose","제안하다,청혼하다"); add(1757,"approve","승인하다,찬성하다"); add(1758,"admit","인정,시인하다")
add(1759,"conduct","수행하다,지휘하다"); add(1760,"reserve","예약하다"); add(1761,"reveal","드러내다")
add(1762,"extend","연장,확장하다"); add(1763,"involve","포함하다,관여하다"); add(1764,"definite","명확한")
add(1765,"significant","중대한"); add(1766,"vital","필수적인"); add(1767,"extreme","극도의,극단적인")
add(1768,"academic","학문의,학구적인"); add(1769,"guilty","유죄의,죄책감을 느끼는"); add(1770,"generally","일반적으로,대체로")
add(1771,"mankind","인류"); add(1772,"poet","시인"); add(1773,"detective","형사,탐정")
add(1774,"consumer","소비자"); add(1775,"chef","주방장,요리사"); add(1776,"wage","임금,노임")
add(1777,"steel","강철"); add(1778,"device","장치"); add(1779,"pill","알약,정제")
add(1780,"ceiling","천장"); add(1781,"aisle","긴 통로"); add(1782,"appearance","외모,출현")
add(1783,"destination","목적지"); add(1784,"semester","학기"); add(1785,"sweat","땀을 흘리다")
add(1786,"switch","바꾸다,스위치"); add(1787,"blank","공백,빈칸의"); add(1788,"permanent","영구적인")
add(1789,"found","설립하다"); add(1790,"seek","구하다,찾다"); add(1791,"rob","빼앗다,강탈하다")
add(1792,"grab","잡아채다"); add(1793,"swing","흔들리다"); add(1794,"cancel","취소하다")
add(1795,"avoid","피하다"); add(1796,"temporary","일시적인,임시의"); add(1797,"steep","가파른")
add(1798,"logical","논리적인"); add(1799,"ridiculous","우스꽝스러운,어리석은"); add(1800,"upstairs","위층으로,의")


def main():
    ensure_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    saved = skipped = 0

    seen_words = set()  # 이번 실행 내 중복 방지

    for (num, word, meaning_ko) in WORDS:
        if word in seen_words:
            skipped += 1
            continue
        seen_words.add(word)

        level, grade_num = get_level(num)
        pos = detect_pos(word, meaning_ko)

        vp = vpp = ving = None
        if pos == "verb":
            vp, vpp, ving = verb_forms(word)

        record = {
            "word_id":     str(uuid.uuid4()),
            "word":        word,
            "pos":         pos,
            "level":       level,
            "grade_num":   grade_num,
            "meaning_ko":  meaning_ko,
            "meaning_en":  None,
            "synonyms":    None,
            "antonyms":    None,
            "example":     None,
            "category":    None,
            "source_book": "뜯어먹는영단어1800",
            "verb_past":   vp,
            "verb_pp":     vpp,
            "verb_ing":    ving,
            "noun_plural": None,
            "adj_comp":    None,
            "adj_super":   None,
            "verified":    1,
        }
        ok = save_word(conn, record)
        if ok: saved += 1
        else:  skipped += 1

    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    by_level = conn.execute(
        "SELECT level, COUNT(*) FROM words GROUP BY level ORDER BY grade_num"
    ).fetchall()
    conn.close()

    print(f"\n완료! 저장: {saved}개  /  중복 건너뜀: {skipped}개")
    print(f"DB 총 단어: {total}개\n")
    print("레벨별 분포:")
    for lv, cnt in by_level:
        print(f"  {lv:6}: {cnt}개")


if __name__ == "__main__":
    main()
