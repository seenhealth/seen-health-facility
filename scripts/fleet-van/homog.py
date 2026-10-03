import numpy as np
def H(src,dst):
    A=[]
    for (x,y),(u,v) in zip(src,dst):
        A.append([x,y,1,0,0,0,-u*x,-u*y,-u]); A.append([0,0,0,x,y,1,-v*x,-v*y,-v])
    _,_,Vt=np.linalg.svd(np.array(A,float)); h=Vt[-1].reshape(3,3); return h/h[2,2]
def ap(h,p):
    q=h@np.array([p[0],p[1],1.0]); return q[:2]/q[2]
