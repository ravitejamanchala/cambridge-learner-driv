// Group triangles by material once at construction. Alternating facade faces
// otherwise produce a GPU draw call per face, including in mirrors/shadows.
export function compactMaterialGroups(geometry){
 if(geometry.groups.length<2)return geometry;
 const buckets=new Map(),index=geometry.index;
 for(const group of geometry.groups){if(!buckets.has(group.materialIndex))buckets.set(group.materialIndex,[]);const out=buckets.get(group.materialIndex);for(let i=group.start;i<group.start+group.count;i++)out.push(index?index.getX(i):i);}
 const indices=[];geometry.clearGroups();for(const [material,values]of buckets){geometry.addGroup(indices.length,values.length,material);for(const i of values)indices.push(i);}geometry.setIndex(indices);return geometry;
}
