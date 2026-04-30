"""seed_mid_high.py — 고2/고3 추가 단어 (~350개)"""
import sqlite3, uuid, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
from backend.agents.doc_agent import ensure_db

DB_PATH = Path(__file__).parent / "qbank.db"
LEVEL_MAP = {"고2": 5, "고3": 6}

IRREG = {
    "arise":("arose","arisen"), "bind":("bound","bound"),
    "choose":("chose","chosen"), "deal":("dealt","dealt"),
    "feed":("fed","fed"), "feel":("felt","felt"),
    "find":("found","found"), "forget":("forgot","forgotten"),
    "grow":("grew","grown"), "hold":("held","held"),
    "keep":("kept","kept"), "lead":("led","led"),
    "leave":("left","left"), "lose":("lost","lost"),
    "mean":("meant","meant"), "meet":("met","met"),
    "overcome":("overcame","overcome"), "pay":("paid","paid"),
    "rise":("rose","risen"), "seek":("sought","sought"),
    "sell":("sold","sold"), "send":("sent","sent"),
    "set":("set","set"), "sit":("sat","sat"),
    "spend":("spent","spent"), "spread":("spread","spread"),
    "stand":("stood","stood"), "teach":("taught","taught"),
    "tell":("told","told"), "understand":("understood","understood"),
    "win":("won","won"), "withdraw":("withdrew","withdrawn"),
}

def verb_forms(w):
    w = w.lower()
    if w in IRREG:
        past, pp = IRREG[w]
        ing = (w[:-1]+"ing") if w.endswith("e") else w+"ing"
        return past, pp, ing
    if w.endswith("e"):
        return w+"d", w+"d", w[:-1]+"ing"
    if w.endswith("y") and len(w)>2 and w[-2] not in "aeiou":
        return w[:-1]+"ied", w[:-1]+"ied", w+"ing"
    if (len(w)>=3 and w[-1] not in "aeiouhwxy"
            and w[-2] in "aeiou" and w[-3] not in "aeiou"):
        return w+w[-1]+"ed", w+w[-1]+"ed", w+w[-1]+"ing"
    return w+"ed", w+"ed", w+"ing"

WORDS = []
def add(word, meaning_ko, pos, level):
    grade = LEVEL_MAP[level]
    e = {"word_id":str(uuid.uuid4()), "word":word, "pos":pos,
         "level":level, "grade_num":grade, "meaning_ko":meaning_ko,
         "meaning_en":None, "synonyms":"[]", "antonyms":"[]",
         "example":None, "source_book":"고등필수어휘",
         "category":"행동" if pos=="verb" else ("추상개념" if pos=="noun" else None),
         "verb_past":None,"verb_pp":None,"verb_ing":None,
         "noun_plural":None,"adj_comp":None,"adj_super":None,"verified":1}
    if pos=="verb":
        p,pp,ing = verb_forms(word)
        e["verb_past"]=p; e["verb_pp"]=pp; e["verb_ing"]=ing
    WORDS.append(e)

# ══════════════════════════════
# 고2 추가 단어 (~190개)
# ══════════════════════════════
add("abandon","포기하다,버리다","verb","고2")
add("absorb","흡수하다","verb","고2")
add("access","접근하다","verb","고2")
add("accurate","정확한","adjective","고2")
add("activate","활성화하다","verb","고2")
add("admire","존경하다","verb","고2")
add("adopt","채택하다","verb","고2")
add("advance","발전하다","verb","고2")
add("afford","여유가 있다","verb","고2")
add("approve","승인하다","verb","고2")
add("arrange","정리하다,주선하다","verb","고2")
add("assign","할당하다","verb","고2")
add("assist","돕다","verb","고2")
add("attach","붙이다","verb","고2")
add("balance","균형,균형을 잡다","noun","고2")
add("basis","근거,기초","noun","고2")
add("behavior","행동,행위","noun","고2")
add("boundary","경계","noun","고2")
add("calculate","계산하다","verb","고2")
add("capture","포착하다,사로잡다","verb","고2")
add("career","직업,경력","noun","고2")
add("clarify","명확히 하다","verb","고2")
add("collect","모으다","verb","고2")
add("compete","경쟁하다","verb","고2")
add("concept","개념","noun","고2")
add("conflict","갈등,충돌","noun","고2")
add("construct","건설하다","verb","고2")
add("context","맥락,상황","noun","고2")
add("contrast","대조,차이","noun","고2")
add("convince","설득하다","verb","고2")
add("cope","대처하다","verb","고2")
add("critical","중요한,비판적인","adjective","고2")
add("cycle","순환,주기","noun","고2")
add("deal","다루다,처리하다","verb","고2")
add("decline","감소하다,거절하다","verb","고2")
add("define","정의하다","verb","고2")
add("deliver","배달하다,전달하다","verb","고2")
add("demand","요구,수요","noun","고2")
add("deny","부인하다","verb","고2")
add("design","설계하다","verb","고2")
add("detect","탐지하다,발견하다","verb","고2")
add("differ","다르다","verb","고2")
add("discover","발견하다","verb","고2")
add("distribute","배포하다,분배하다","verb","고2")
add("divide","나누다","verb","고2")
add("document","기록하다","verb","고2")
add("earn","벌다,얻다","verb","고2")
add("emerge","나타나다,출현하다","verb","고2")
add("engage","참여하다,관여하다","verb","고2")
add("ensure","보장하다","verb","고2")
add("examine","조사하다,검토하다","verb","고2")
add("exchange","교환하다","verb","고2")
add("expect","기대하다","verb","고2")
add("explain","설명하다","verb","고2")
add("explore","탐험하다","verb","고2")
add("express","표현하다","verb","고2")
add("extend","연장하다,확장하다","verb","고2")
add("familiar","친숙한,익숙한","adjective","고2")
add("force","강요하다,힘","verb","고2")
add("found","설립하다","verb","고2")
add("gain","얻다,증가하다","verb","고2")
add("gather","모이다,모으다","verb","고2")
add("goal","목표","noun","고2")
add("guide","안내하다","verb","고2")
add("handle","다루다,처리하다","verb","고2")
add("harm","해치다,피해","verb","고2")
add("hire","고용하다","verb","고2")
add("ignore","무시하다","verb","고2")
add("increase","증가하다","verb","고2")
add("independent","독립적인","adjective","고2")
add("intend","의도하다","verb","고2")
add("invest","투자하다","verb","고2")
add("issue","문제,사안","noun","고2")
add("judge","판단하다","verb","고2")
add("knowledge","지식","noun","고2")
add("lack","부족하다,결핍","verb","고2")
add("launch","시작하다,출시하다","verb","고2")
add("limit","제한하다","verb","고2")
add("mention","언급하다","verb","고2")
add("miss","그리워하다,놓치다","verb","고2")
add("notice","알아차리다","verb","고2")
add("offer","제안하다,제공하다","verb","고2")
add("operate","운영하다,작동하다","verb","고2")
add("organize","조직하다,정리하다","verb","고2")
add("outcome","결과,성과","noun","고2")
add("predict","예측하다","verb","고2")
add("publish","출판하다","verb","고2")
add("purpose","목적,의도","noun","고2")
add("replace","교체하다","verb","고2")
add("research","연구하다","verb","고2")
add("resource","자원","noun","고2")
add("result","결과","noun","고2")
add("role","역할","noun","고2")
add("select","선택하다","verb","고2")
add("separate","분리하다","verb","고2")
add("settle","해결하다,정착하다","verb","고2")
add("signal","신호,나타내다","noun","고2")
add("situation","상황","noun","고2")
add("solve","해결하다","verb","고2")
add("source","출처,원천","noun","고2")
add("strategy","전략","noun","고2")
add("structure","구조","noun","고2")
add("survive","살아남다","verb","고2")
add("tend","경향이 있다","verb","고2")
add("track","추적하다","verb","고2")
add("translate","번역하다","verb","고2")
add("treat","다루다,치료하다","verb","고2")
add("trust","신뢰하다","verb","고2")
add("update","갱신하다","verb","고2")
add("value","가치,소중히 여기다","noun","고2")
add("waste","낭비하다","verb","고2")
add("willing","기꺼이 하는","adjective","고2")

# ══════════════════════════════
# 고3 추가 단어 (~120개)
# ══════════════════════════════
add("abolish","폐지하다","verb","고3")
add("accelerate","가속화하다","verb","고3")
add("acknowledge","인정하다","verb","고3")
add("aggregate","집계하다,총계","verb","고3")
add("allocate","할당하다","verb","고3")
add("ambivalent","양면적인","adjective","고3")
add("amplify","증폭시키다","verb","고3")
add("anticipate","예상하다","verb","고3")
add("assertion","주장,단언","noun","고3")
add("assumption","가정,추정","noun","고3")
add("authentic","진본의,진정한","adjective","고3")
add("autonomy","자율성","noun","고3")
add("bias","편견","noun","고3")
add("chronic","만성적인","adjective","고3")
add("circulate","순환하다","verb","고3")
add("cite","인용하다","verb","고3")
add("cognitive","인지적인","adjective","고3")
add("compelling","설득력 있는","adjective","고3")
add("complexity","복잡성","noun","고3")
add("compromise","타협하다","verb","고3")
add("confront","직면하다","verb","고3")
add("consensus","합의","noun","고3")
add("constrain","제한하다,억제하다","verb","고3")
add("contempt","경멸","noun","고3")
add("convey","전달하다,전하다","verb","고3")
add("criterion","기준,판단 기준","noun","고3")
add("decade","10년","noun","고3")
add("decisive","결정적인","adjective","고3")
add("dedicate","헌신하다","verb","고3")
add("deliberate","의도적인","adjective","고3")
add("demonstrate","보여주다,증명하다","verb","고3")
add("dependency","의존성","noun","고3")
add("deprive","빼앗다","verb","고3")
add("dimension","차원,측면","noun","고3")
add("discourse","담화,담론","noun","고3")
add("dispute","논쟁하다,분쟁","verb","고3")
add("dominant","지배적인","adjective","고3")
add("dynamic","역동적인","adjective","고3")
add("emerge","출현하다,나타나다","verb","고3")
add("empirical","경험적인","adjective","고3")
add("enforce","강요하다,집행하다","verb","고3")
add("evident","명백한","adjective","고3")
add("evolve","진화하다,발전하다","verb","고3")
add("exploit","이용하다,착취하다","verb","고3")
add("fluctuate","변동하다","verb","고3")
add("framework","틀,체계","noun","고3")
add("generate","생성하다","verb","고3")
add("global","전 세계적인","adjective","고3")
add("gradual","점진적인","adjective","고3")
add("guarantee","보장하다","verb","고3")
add("ideology","이념","noun","고3")
add("illustrate","설명하다,예시하다","verb","고3")
add("implicit","암묵적인","adjective","고3")
add("impose","부과하다","verb","고3")
add("incentive","동기,유인","noun","고3")
add("incorporate","통합하다","verb","고3")
add("indicate","나타내다","verb","고3")
add("inevitable","불가피한","adjective","고3")
add("infer","추론하다","verb","고3")
add("infrastructure","기반시설","noun","고3")
add("inherent","내재적인","adjective","고3")
add("insight","통찰력","noun","고3")
add("interpret","해석하다","verb","고3")
add("intervene","개입하다","verb","고3")
add("justify","정당화하다","verb","고3")
add("manipulate","조작하다","verb","고3")
add("mechanism","메커니즘,원리","noun","고3")
add("minimize","최소화하다","verb","고3")
add("mislead","오도하다","verb","고3")
add("notion","개념,생각","noun","고3")
add("objective","객관적인,목표","adjective","고3")
add("perceive","인식하다","verb","고3")
add("perspective","관점,시각","noun","고3")
add("phenomenon","현상","noun","고3")
add("policy","정책","noun","고3")
add("potential","잠재적인","adjective","고3")
add("premise","전제","noun","고3")
add("preserve","보존하다","verb","고3")
add("principle","원칙","noun","고3")
add("productive","생산적인","adjective","고3")
add("prohibit","금지하다","verb","고3")
add("proportion","비율,비례","noun","고3")
add("psychology","심리학","noun","고3")
add("regulate","규제하다","verb","고3")
add("reinforce","강화하다","verb","고3")
add("relevant","관련 있는","adjective","고3")
add("rhetoric","수사학,미사여구","noun","고3")
add("scope","범위","noun","고3")
add("shift","변화하다,바꾸다","verb","고3")
add("societal","사회적인","adjective","고3")
add("speculate","추측하다","verb","고3")
add("sphere","영역,범위","noun","고3")
add("subsequent","그 다음의","adjective","고3")
add("supplement","보완하다,보충하다","verb","고3")
add("synthesize","종합하다","verb","고3")
add("tension","긴장,장력","noun","고3")
add("threshold","임계점,문턱","noun","고3")
add("undermine","약화시키다","verb","고3")
add("universal","보편적인","adjective","고3")
add("unravel","풀다,밝히다","verb","고3")


def main():
    ensure_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    saved = skipped = 0
    for w in WORDS:
        conn.execute("""
            INSERT OR IGNORE INTO words
              (word_id,word,pos,level,grade_num,meaning_ko,meaning_en,
               synonyms,antonyms,example,category,source_book,
               verb_past,verb_pp,verb_ing,noun_plural,
               adj_comp,adj_super,verified)
            VALUES
              (:word_id,:word,:pos,:level,:grade_num,:meaning_ko,:meaning_en,
               :synonyms,:antonyms,:example,:category,:source_book,
               :verb_past,:verb_pp,:verb_ing,:noun_plural,
               :adj_comp,:adj_super,:verified)
        """, w)
        if conn.execute("SELECT changes()").fetchone()[0]:
            saved += 1
        else:
            skipped += 1
    conn.commit()
    conn.close()
    print(f"완료! 저장: {saved}개 / 중복 건너뜀: {skipped}개")

    conn2 = sqlite3.connect(DB_PATH)
    total = conn2.execute("SELECT COUNT(*) FROM words WHERE verified=1").fetchone()[0]
    print(f"DB 총 단어: {total}개\n레벨별:")
    for r in conn2.execute(
        "SELECT level, COUNT(*) FROM words WHERE verified=1 GROUP BY level ORDER BY grade_num"
    ).fetchall():
        print(f"  {r[0]}: {r[1]}개")
    conn2.close()


if __name__ == "__main__":
    main()
