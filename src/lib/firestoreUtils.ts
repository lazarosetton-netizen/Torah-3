import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  orderBy,
  updateDoc,
  doc,
  getDocFromServer,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { SavedStudy, ChatMessage } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export async function deleteStudySession(studyId: string) {
  const path = `studies/${studyId}`;
  try {
    const studyRef = doc(db, 'studies', studyId);
    await deleteDoc(studyRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveStudySession(study: Omit<SavedStudy, 'userId' | 'createdAt'>) {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error("User must be signed in");

  const path = 'studies';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...study,
      userId,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStudyChat(studyId: string, chatHistory: ChatMessage[]) {
  const path = `studies/${studyId}`;
  try {
    const studyRef = doc(db, 'studies', studyId);
    await updateDoc(studyRef, { chatHistory });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function getStudySessions() {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const path = 'studies';
  try {
    const q = query(
      collection(db, path), 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedStudy));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}
