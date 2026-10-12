import test from 'node:test'
import assert from 'node:assert/strict'
import {helpGuides,helpFaqs,filterHelp,guideLinks} from '../src/lib/helpContent.js'
import {canAccess} from '../src/lib/navigation.js'
test('help search finds instructions inside steps and combines keywords with the selected topic',()=>{
 assert.ok(filterHelp(helpGuides,'all','上架产品').some(g=>g.id==='new-product'))
 assert.ok(filterHelp(helpGuides,'all','素材命名').some(g=>g.id==='media-name'))
 assert.ok(filterHelp(helpGuides,'media','引用 命名').some(g=>g.id==='media-name'))
 assert.deepEqual(filterHelp(helpGuides,'products','自动命名'),[])
 assert.ok(filterHelp(helpGuides,'all','20mb').some(g=>g.id==='media'))
 assert.equal(filterHelp(helpGuides,'all','   ').length,helpGuides.length)
 assert.equal(filterHelp(helpFaqs,'all','no-such-help-fixture').length,0)
 assert.ok(filterHelp(helpFaqs,'media','历史').some(g=>g.id==='delete-media'))
})
test('multi-destination help keeps separate access requirements for news and artists',()=>{
 const links=guideLinks(helpGuides.find(g=>g.id==='news'))
 const user={permissions:['artists:read']}
 assert.deepEqual(links.filter(l=>canAccess(user,l.permission)).map(l=>l.link),['/artists'])
 const account=guideLinks(helpGuides.find(g=>g.id==='account'))
 assert.ok(canAccess({permissions:[]},account[0].permission))
})
