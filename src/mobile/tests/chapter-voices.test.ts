// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { chapterAnalysisReady, chapterCharacters, chapterStops, proposeChapterVoices, confirmChapterVoices, chapterReviewView } from '../chapter-voices';
import { defaults, type Book, type Voice } from '../types';
import { appliquerAnalyse, proposerVoix } from '../casting';
const voices: Voice[] = [
  {id:'neural:siwis',name:'Siwis',language:'fr-FR',kind:'neural',installed:true,gender:'femme'},
  {id:'neural:miro',name:'Miro',language:'fr-FR',kind:'neural',installed:false,gender:'homme',size:21.3},
];
const fixture = (): Book => ({id:'chapters',title:'Livre',author:'',format:'TXT',language:'fr',color:0,
  segments:['Un récit.','Camille parle.','Un récit.','Camille parle.','Pierre arrive.'],
  chapters:[{title:'Un',start:0,end:2},{title:'Deux',start:2,end:4},{title:'Trois',start:4,end:5}],
  position:0,added:0,opened:0,completed:false,bookmarks:[],casting:{enabled:true,
    characters:[{id:'narrator',name:'Narrateur',voice:'system:default',pitch:1,rate:1,automaticVoice:true},
      {id:'camille',name:'Camille',voice:'neural:siwis',pitch:1,rate:1,gender:'femme',automaticVoice:true},
      {id:'pierre',name:'Pierre',voice:'',pitch:1,rate:1,gender:'homme',automaticVoice:true}],
    assignments:{'1':'camille','3':'camille','4':'pierre'},analysis:{state:'partial',completed:['0:2']}}});

describe('bilan des voix par chapitre', () => {
  it('ne propose que les personnages qui parlent dans le chapitre', () => {
    const book = fixture();
    expect(chapterCharacters(book).map(c => c.id)).toEqual(['narrator','camille']);
    const choices = proposeChapterVoices(book, voices);
    expect(choices.map(c => c.voice)).toEqual(['system:default','neural:siwis']);
    expect(choices.every(c => !c.confirmed)).toBe(true);
    document.body.innerHTML = chapterReviewView(book, choices, voices, true);
    expect(document.body.textContent).toContain('2/2 voix installées');
    expect(document.querySelectorAll('select')).toHaveLength(2);
    // Chaque association peut être écoutée avant de valider.
    const ecoutes = document.querySelectorAll<HTMLButtonElement>('[data-action="chapter-voice-preview"]');
    expect(ecoutes).toHaveLength(2);
    expect(ecoutes[0].dataset.id).toBe('narrator');
    expect(ecoutes[1].getAttribute('aria-label')).toContain('Camille');
  });

  it('réutilise les voix validées aux chapitres suivants, même après de nouvelles propositions', () => {
    const book = fixture(), choices = proposeChapterVoices(book, voices);
    confirmChapterVoices(choices, {narrator:'system:default',camille:'neural:siwis'});
    proposerVoix(book.casting!, voices, defaults.voice, 'fr');
    const next = proposeChapterVoices(book, voices, 2);
    expect(next.every(c => c.confirmed)).toBe(true);
    expect(next.map(c => c.voice)).toEqual(['system:default','neural:siwis']);
    expect(chapterStops(book, defaults)).toEqual([4]);
  });

  it('propose une voix à télécharger pour un nouveau personnage, sans toucher aux voix connues', () => {
    const book = fixture(); book.position = 4;
    const choices = proposeChapterVoices(book, voices);
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({voice:'neural:miro',confirmed:false});
    expect(chapterReviewView(book, choices, voices, true)).toContain('0/1 voix installées, 1 à télécharger');
    expect(chapterReviewView(book, choices, voices, true)).toContain('à télécharger (21.3 Mo)');
  });

  it('bloque un chapitre non analysé avec IA même si ses voix sont connues', () => {
    const book = fixture(), settings = {...defaults,ia:{url:'https://example.com/v1',modele:'demo',revision:'r',enabled:true}};
    confirmChapterVoices(proposeChapterVoices(book, voices), {});
    expect(chapterAnalysisReady(book, settings)).toBe(true);
    expect(chapterAnalysisReady(book, settings, 2)).toBe(false);
    expect(chapterStops(book, settings)).toEqual([2,4]);
    book.casting!.analysis!.completed.push('2:4');
    expect(chapterStops(book, settings)).toEqual([4]);
    expect(chapterReviewView(book, [], voices, false)).toContain('disabled');
  });

  it('une nouvelle analyse conserve la voix validée pour une identité existante', () => {
    const book = fixture();
    confirmChapterVoices(proposeChapterVoices(book, voices), {camille:'neural:siwis'});
    appliquerAnalyse(book.casting!, {personnages:[{id:'camille',nom:'Camille',genre:'femme',role:'personnage'}],locuteurs:['camille']},
      {narrateur:'system:default',homme:'neural:miro',femme:'neural:siwis'}, 3);
    const choice = proposeChapterVoices(book, voices, 2).find(c => c.role.name === 'Camille');
    expect(choice).toMatchObject({voice:'neural:siwis',confirmed:true});
  });
});
