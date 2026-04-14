"""seed_high.py — 고2/고3/수능 단어 삽입"""
import sqlite3, uuid, re, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))
from backend.agents.doc_agent import ensure_db

DB_PATH = Path(__file__).parent / "qbank.db"

LEVEL_MAP = {"고2": 5, "고3": 6, "수능": 7}

IRREG = {
    "overcome":    ("overcame",    "overcome"),
    "seek":        ("sought",      "sought"),
    "lead":        ("led",         "led"),
    "spread":      ("spread",      "spread"),
    "arise":       ("arose",       "arisen"),
    "strive":      ("strove",      "striven"),
    "bind":        ("bound",       "bound"),
    "feed":        ("fed",         "fed"),
    "hold":        ("held",        "held"),
    "lose":        ("lost",        "lost"),
    "grow":        ("grew",        "grown"),
    "tear":        ("tore",        "torn"),
    "wear":        ("wore",        "worn"),
    "foresee":     ("foresaw",     "foreseen"),
    "underlie":    ("underlay",    "underlain"),
    "lay":         ("laid",        "laid"),
    "pay":         ("paid",        "paid"),
    "say":         ("said",        "said"),
    "forbid":      ("forbade",     "forbidden"),
    "forgive":     ("forgave",     "forgiven"),
    "forsake":     ("forsook",     "forsaken"),
    "lend":        ("lent",        "lent"),
    "spend":       ("spent",       "spent"),
    "understand":  ("understood",  "understood"),
    "withstand":   ("withstood",   "withstood"),
    "misunderstand": ("misunderstood", "misunderstood"),
    "mislead":     ("misled",      "misled"),
    "outrun":      ("outran",      "outrun"),
    "undergo":     ("underwent",   "undergone"),
    "uphold":      ("upheld",      "upheld"),
}


def verb_forms(word: str):
    """규칙·불규칙 동사 활용형 반환."""
    w = word.lower()
    if w in IRREG:
        past, pp = IRREG[w]
        ing = w + "ing" if w.endswith("e") else (
            w[:-1] + "ing" if w.endswith("ie") else w + "ing"
        )
        if w.endswith("e"):
            ing = w[:-1] + "ing"
        return past, pp, ing

    # 규칙 동사
    if w.endswith("e"):
        past = w + "d"
        ing  = w[:-1] + "ing"
    elif w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        past = w[:-1] + "ied"
        ing  = w + "ing"
    elif (len(w) >= 3 and w[-1] not in "aeiouhwxy"
          and w[-2] in "aeiou" and w[-3] not in "aeiou"):
        past = w + w[-1] + "ed"
        ing  = w + w[-1] + "ing"
    else:
        past = w + "ed"
        ing  = w + "ing"
    return past, past, ing


WORDS: list[dict] = []

def add(word: str, meaning_ko: str, pos: str, level: str):
    grade = LEVEL_MAP.get(level, 5)
    entry = {
        "word_id":    str(uuid.uuid4()),
        "word":       word,
        "pos":        pos,
        "level":      level,
        "grade_num":  grade,
        "meaning_ko": meaning_ko,
        "meaning_en": None,
        "synonyms":   "[]",
        "antonyms":   "[]",
        "example":    None,
        "category":   "행동" if pos == "verb" else ("추상개념" if pos == "noun" else None),
        "source_book": "고등필수어휘",
        "verb_past":  None, "verb_pp": None, "verb_ing": None,
        "noun_plural": None,
        "adj_comp": None, "adj_super": None,
        "verified":   1,
    }
    if pos == "verb":
        past, pp, ing = verb_forms(word)
        entry["verb_past"] = past
        entry["verb_pp"]   = pp
        entry["verb_ing"]  = ing
    WORDS.append(entry)


# ══════════════════════════════════════
# 고2 단어
# ══════════════════════════════════════
add("accomplish","성취하다","verb","고2")
add("accumulate","축적하다","verb","고2")
add("acknowledge","인정하다","verb","고2")
add("acquire","습득하다","verb","고2")
add("adapt","적응하다","verb","고2")
add("adequate","충분한,적절한","adjective","고2")
add("adjust","조정하다","verb","고2")
add("advocate","지지하다","verb","고2")
add("allocate","할당하다","verb","고2")
add("alter","변경하다","verb","고2")
add("analyze","분석하다","verb","고2")
add("anticipate","예상하다","verb","고2")
add("apparent","명백한","adjective","고2")
add("appreciate","감사하다,이해하다","verb","고2")
add("appropriate","적절한","adjective","고2")
add("assert","주장하다","verb","고2")
add("assume","가정하다","verb","고2")
add("attribute","귀인하다,특성","verb","고2")
add("available","이용 가능한","adjective","고2")
add("barrier","장벽","noun","고2")
add("benefit","이익,혜택","noun","고2")
add("capable","능력 있는","adjective","고2")
add("challenge","도전","noun","고2")
add("characteristic","특성","noun","고2")
add("circumstance","상황,환경","noun","고2")
add("classify","분류하다","verb","고2")
add("collaborate","협력하다","verb","고2")
add("communicate","소통하다","verb","고2")
add("complex","복잡한","adjective","고2")
add("concern","관심,걱정","noun","고2")
add("consistent","일관된","adjective","고2")
add("contribute","기여하다","verb","고2")
add("convenient","편리한","adjective","고2")
add("cooperate","협력하다","verb","고2")
add("correspond","일치하다","verb","고2")
add("crucial","중요한","adjective","고2")
add("demonstrate","보여주다","verb","고2")
add("describe","묘사하다","verb","고2")
add("determine","결정하다","verb","고2")
add("diminish","줄어들다","verb","고2")
add("distinguish","구별하다","verb","고2")
add("diverse","다양한","adjective","고2")
add("dominate","지배하다","verb","고2")
add("effective","효과적인","adjective","고2")
add("eliminate","제거하다","verb","고2")
add("emphasize","강조하다","verb","고2")
add("enable","가능하게 하다","verb","고2")
add("encourage","격려하다","verb","고2")
add("enhance","향상시키다","verb","고2")
add("establish","설립하다","verb","고2")
add("evaluate","평가하다","verb","고2")
add("evidence","증거","noun","고2")
add("excessive","과도한","adjective","고2")
add("expand","확장하다","verb","고2")
add("expose","드러내다","verb","고2")
add("facilitate","촉진하다","verb","고2")
add("factor","요소","noun","고2")
add("feature","특징","noun","고2")
add("flexible","유연한","adjective","고2")
add("fundamental","기본적인","adjective","고2")
add("generate","생성하다","verb","고2")
add("identify","확인하다","verb","고2")
add("illustrate","설명하다","verb","고2")
add("impact","영향,충격","noun","고2")
add("implement","실행하다","verb","고2")
add("imply","암시하다","verb","고2")
add("indicate","나타내다","verb","고2")
add("influence","영향","noun","고2")
add("initial","처음의","adjective","고2")
add("innovate","혁신하다","verb","고2")
add("interact","상호작용하다","verb","고2")
add("interpret","해석하다","verb","고2")
add("involve","포함하다","verb","고2")
add("maintain","유지하다","verb","고2")
add("manage","관리하다","verb","고2")
add("measure","측정하다","verb","고2")
add("method","방법","noun","고2")
add("modify","수정하다","verb","고2")
add("monitor","감시하다","verb","고2")
add("motivate","동기 부여하다","verb","고2")
add("numerous","수많은","adjective","고2")
add("observe","관찰하다","verb","고2")
add("obtain","얻다","verb","고2")
add("overcome","극복하다","verb","고2")
add("participate","참여하다","verb","고2")
add("perceive","인식하다","verb","고2")
add("perform","수행하다","verb","고2")
add("prefer","선호하다","verb","고2")
add("prevent","예방하다","verb","고2")
add("proceed","진행하다","verb","고2")
add("promote","촉진하다","verb","고2")
add("propose","제안하다","verb","고2")
add("recognize","인식하다","verb","고2")
add("recommend","추천하다","verb","고2")
add("reduce","줄이다","verb","고2")
add("reflect","반영하다","verb","고2")
add("rely","의존하다","verb","고2")
add("represent","나타내다","verb","고2")
add("require","요구하다","verb","고2")
add("resolve","해결하다","verb","고2")
add("respond","응답하다","verb","고2")
add("restrict","제한하다","verb","고2")
add("reveal","드러내다","verb","고2")
add("significant","중요한","adjective","고2")
add("specific","특정한","adjective","고2")
add("sufficient","충분한","adjective","고2")
add("sustain","유지하다","verb","고2")
add("transform","변형하다","verb","고2")
add("trend","경향","noun","고2")
add("utilize","활용하다","verb","고2")
add("vary","다양하다","verb","고2")
add("verify","확인하다","verb","고2")

# ══════════════════════════════════════
# 고3 단어
# ══════════════════════════════════════
add("abstract","추상적인","adjective","고3")
add("abundant","풍부한","adjective","고3")
add("acute","심각한,날카로운","adjective","고3")
add("aesthetic","미적인","adjective","고3")
add("alleviate","완화하다","verb","고3")
add("ambiguous","모호한","adjective","고3")
add("analogy","유추,비유","noun","고3")
add("arbitrary","임의적인","adjective","고3")
add("articulate","분명히 표현하다","verb","고3")
add("aspire","열망하다","verb","고3")
add("assimilate","동화하다","verb","고3")
add("benevolent","자애로운","adjective","고3")
add("brevity","간결함","noun","고3")
add("catastrophic","재앙적인","adjective","고3")
add("coherent","일관된,명확한","adjective","고3")
add("compensate","보상하다","verb","고3")
add("competent","능숙한","adjective","고3")
add("compromise","타협하다","verb","고3")
add("concise","간결한","adjective","고3")
add("conducive","도움이 되는","adjective","고3")
add("contemplate","심사숙고하다","verb","고3")
add("contradictory","모순적인","adjective","고3")
add("controversial","논란이 있는","adjective","고3")
add("credible","신뢰할 수 있는","adjective","고3")
add("cultivate","기르다,경작하다","verb","고3")
add("deduce","추론하다","verb","고3")
add("deplete","고갈시키다","verb","고3")
add("derive","유래하다","verb","고3")
add("detrimental","해로운","adjective","고3")
add("deviate","벗어나다","verb","고3")
add("disrupt","방해하다","verb","고3")
add("elaborate","정교한","adjective","고3")
add("eloquent","유창한","adjective","고3")
add("empathy","공감","noun","고3")
add("enigmatic","수수께끼 같은","adjective","고3")
add("escalate","확대되다","verb","고3")
add("exaggerate","과장하다","verb","고3")
add("exclusive","독점적인","adjective","고3")
add("execute","실행하다","verb","고3")
add("explicit","명시적인","adjective","고3")
add("formidable","강력한","adjective","고3")
add("genuine","진정한","adjective","고3")
add("hierarchy","계층","noun","고3")
add("hypothesis","가설","noun","고3")
add("illuminate","밝히다","verb","고3")
add("imminent","임박한","adjective","고3")
add("impartial","공정한","adjective","고3")
add("inevitable","불가피한","adjective","고3")
add("inherent","내재적인","adjective","고3")
add("integrity","성실성,온전함","noun","고3")
add("intricate","복잡한","adjective","고3")
add("legitimate","합법적인","adjective","고3")
add("lucid","명확한","adjective","고3")
add("manifest","나타나다","verb","고3")
add("meticulous","꼼꼼한","adjective","고3")
add("misconception","오해","noun","고3")
add("moderate","적당한","adjective","고3")
add("momentum","탄력,힘","noun","고3")
add("negotiate","협상하다","verb","고3")
add("obsolete","구식의","adjective","고3")
add("optimal","최적의","adjective","고3")
add("overwhelming","압도적인","adjective","고3")
add("paradigm","패러다임","noun","고3")
add("persevere","인내하다","verb","고3")
add("plausible","그럴듯한","adjective","고3")
add("pragmatic","실용적인","adjective","고3")
add("predominant","지배적인","adjective","고3")
add("profound","심오한","adjective","고3")
add("prominent","두드러진","adjective","고3")
add("rational","이성적인","adjective","고3")
add("reluctant","마지못한","adjective","고3")
add("remarkable","놀라운","adjective","고3")
add("resilience","회복력","noun","고3")
add("rigorous","엄격한","adjective","고3")
add("sophisticated","정교한","adjective","고3")
add("stimulate","자극하다","verb","고3")
add("subtle","미묘한","adjective","고3")
add("surplus","잉여","noun","고3")
add("susceptible","영향 받기 쉬운","adjective","고3")
add("thorough","철저한","adjective","고3")
add("tolerance","관용","noun","고3")
add("transparent","투명한","adjective","고3")
add("unanimous","만장일치의","adjective","고3")
add("underlying","근본적인","adjective","고3")
add("unprecedented","전례 없는","adjective","고3")
add("urgent","긴급한","adjective","고3")
add("validate","유효성을 검증하다","verb","고3")
add("versatile","다재다능한","adjective","고3")
add("vigorous","활기찬","adjective","고3")
add("vulnerable","취약한","adjective","고3")

# ══════════════════════════════════════
# 수능 단어
# ══════════════════════════════════════
add("acquiesce","묵인하다","verb","수능")
add("adamant","단호한","adjective","수능")
add("affluent","부유한","adjective","수능")
add("allude","암시하다","verb","수능")
add("ameliorate","개선하다","verb","수능")
add("amplify","확대하다","verb","수능")
add("analogous","유사한","adjective","수능")
add("apprehensive","걱정하는","adjective","수능")
add("ardent","열렬한","adjective","수능")
add("astute","예리한","adjective","수능")
add("augment","증가시키다","verb","수능")
add("benign","온화한,무해한","adjective","수능")
add("bolster","강화하다","verb","수능")
add("candid","솔직한","adjective","수능")
add("catalyst","촉매","noun","수능")
add("censure","비난하다","verb","수능")
add("circumvent","회피하다","verb","수능")
add("cogent","설득력 있는","adjective","수능")
add("complacent","자기만족적인","adjective","수능")
add("condone","묵인하다","verb","수능")
add("connotation","함축,내포","noun","수능")
add("consolidate","통합하다","verb","수능")
add("contempt","경멸","noun","수능")
add("converge","수렴하다","verb","수능")
add("credulous","잘 믿는","adjective","수능")
add("decipher","해독하다","verb","수능")
add("defiant","반항적인","adjective","수능")
add("denounce","비난하다","verb","수능")
add("desolate","황폐한","adjective","수능")
add("discern","식별하다","verb","수능")
add("disparate","이질적인","adjective","수능")
add("diverge","갈라지다","verb","수능")
add("dogmatic","독단적인","adjective","수능")
add("eccentric","별난","adjective","수능")
add("emulate","모방하다","verb","수능")
add("enigma","수수께끼","noun","수능")
add("epitome","전형","noun","수능")
add("equivocal","모호한","adjective","수능")
add("erroneous","잘못된","adjective","수능")
add("exemplary","모범적인","adjective","수능")
add("extraneous","관련 없는","adjective","수능")
add("fallacious","잘못된","adjective","수능")
add("fervent","열렬한","adjective","수능")
add("figurative","비유적인","adjective","수능")
add("foster","양육하다,촉진하다","verb","수능")
add("frugal","검소한","adjective","수능")
add("futile","무익한","adjective","수능")
add("haphazard","무계획적인","adjective","수능")
add("herald","예고하다","verb","수능")
add("hypothetical","가정적인","adjective","수능")
add("immutable","불변의","adjective","수능")
add("imperative","반드시 필요한","adjective","수능")
add("implicit","암시적인","adjective","수능")
add("inadvertent","부주의한","adjective","수능")
add("indifferent","무관심한","adjective","수능")
add("indignant","분개한","adjective","수능")
add("intrepid","용감한","adjective","수능")
add("lament","애도하다","verb","수능")
add("languid","나른한","adjective","수능")
add("latent","잠재적인","adjective","수능")
add("lenient","관대한","adjective","수능")
add("magnanimous","관대한","adjective","수능")
add("negate","부정하다","verb","수능")
add("negligent","부주의한","adjective","수능")
add("nonchalant","태연한","adjective","수능")
add("oblivious","의식하지 못하는","adjective","수능")
add("obscure","불명확한","adjective","수능")
add("obstinate","완고한","adjective","수능")
add("ominous","불길한","adjective","수능")
add("pacify","진정시키다","verb","수능")
add("pensive","생각에 잠긴","adjective","수능")
add("perpetuate","영속시키다","verb","수능")
add("precarious","불안정한","adjective","수능")
add("proficient","능숙한","adjective","수능")
add("provocative","도발적인","adjective","수능")
add("quandary","딜레마","noun","수능")
add("rectify","수정하다","verb","수능")
add("refute","반박하다","verb","수능")
add("repudiate","거부하다","verb","수능")
add("rhetoric","수사학,미사여구","noun","수능")
add("scrutinize","면밀히 조사하다","verb","수능")
add("skeptical","회의적인","adjective","수능")
add("solidarity","연대","noun","수능")
add("somber","침울한","adjective","수능")
add("stagnant","정체된","adjective","수능")
add("stringent","엄격한","adjective","수능")
add("succinct","간결한","adjective","수능")
add("tenacious","끈질긴","adjective","수능")
add("tentative","잠정적인","adjective","수능")
add("threshold","임계점,문턱","noun","수능")
add("tranquil","고요한","adjective","수능")
add("turbulent","격동적인","adjective","수능")
add("ubiquitous","어디에나 있는","adjective","수능")
add("vague","모호한","adjective","수능")
add("verbose","말이 많은","adjective","수능")
add("vigilant","경계하는","adjective","수능")
add("volatile","불안정한","adjective","수능")
add("wary","경계하는","adjective","수능")
add("zealous","열렬한","adjective","수능")


# ══════════════════════════════════════
# DB 삽입
# ══════════════════════════════════════
def main():
    ensure_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    saved = skipped = 0
    for w in WORDS:
        try:
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
        except Exception as e:
            print(f"  오류 [{w['word']}]: {e}")
    conn.commit()
    conn.close()

    print(f"\n완료! 저장: {saved}개  /  중복 건너뜀: {skipped}개")
    conn2 = sqlite3.connect(DB_PATH)
    total = conn2.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    print(f"DB 총 단어: {total}개\n레벨별 분포:")
    for row in conn2.execute(
        "SELECT level, COUNT(*) FROM words GROUP BY level ORDER BY grade_num"
    ).fetchall():
        print(f"  {row[0]:<8}: {row[1]}개")
    conn2.close()


if __name__ == "__main__":
    main()
